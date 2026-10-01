import { randomBytes } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { OrcadSecretKeyError, parseOrcadSecretKey } from './orcad-secret-key'
import { resolveOrcadExitCode } from './orcad-exit-code'
import { createAesGcmSecretStore } from './orcad-aes-gcm-secret-store'
import { createLazyOrcadSecretStore, resolveOrcadSecretStore } from './orcad-secret-store'

const KEY = randomBytes(32)

describe('parseOrcadSecretKey', () => {
  it('accepts a 32-byte key as hex or base64, trimming whitespace', () => {
    expect(parseOrcadSecretKey(`${KEY.toString('hex')}\n`).equals(KEY)).toBe(true)
    expect(parseOrcadSecretKey(` ${KEY.toString('base64')} `).equals(KEY)).toBe(true)
    expect(parseOrcadSecretKey(KEY.toString('base64url')).equals(KEY)).toBe(true)
  })

  it('rejects any other length without echoing the value', () => {
    const bad = 'abcd'.repeat(5)
    let message = ''
    try {
      parseOrcadSecretKey(bad)
    } catch (error) {
      expect(error).toBeInstanceOf(OrcadSecretKeyError)
      message = (error as Error).message
    }
    expect(message).toContain('32 bytes')
    expect(message).not.toContain(bad)
  })
})

describe('createAesGcmSecretStore', () => {
  const store = createAesGcmSecretStore(KEY)

  it('round-trips and reports sealed protection', () => {
    const cipher = store.encryptString('lin_api_secret')
    expect(store.isEncryptionAvailable()).toBe(true)
    expect(store.describeProtectionGap()).toBeNull()
    expect(cipher.toString('utf8')).not.toContain('lin_api_secret')
    expect(store.decryptString(cipher)).toBe('lin_api_secret')
  })

  it('uses a fresh IV per call', () => {
    expect(store.encryptString('x').equals(store.encryptString('x'))).toBe(false)
  })

  it('fails closed on tampering, truncation, an unknown version and a different key', () => {
    const cipher = store.encryptString('secret')
    const tampered = Buffer.from(cipher)
    tampered[tampered.length - 1] ^= 1
    expect(() => store.decryptString(tampered)).toThrow()
    expect(() => store.decryptString(cipher.subarray(0, 10))).toThrow()
    const wrongVersion = Buffer.from(cipher)
    wrongVersion[0] = 9
    expect(() => store.decryptString(wrongVersion)).toThrow()
    expect(() => createAesGcmSecretStore(randomBytes(32)).decryptString(cipher)).toThrow()
  })
})

describe('resolveOrcadSecretStore', () => {
  const run = vi.fn()
  const readFile = vi.fn()
  const base = { platform: 'linux' as NodeJS.Platform, run, readFile }

  it('prefers CUBITO_SECRET_KEY over everything else', () => {
    const { store, source } = resolveOrcadSecretStore({
      ...base,
      platform: 'darwin',
      env: { CUBITO_SECRET_KEY: KEY.toString('hex') }
    })
    expect(source).toBe('env')
    expect(store.decryptString(createAesGcmSecretStore(KEY).encryptString('a'))).toBe('a')
    expect(run).not.toHaveBeenCalled()
  })

  it('reads CUBITO_SECRET_KEY_FILE when no inline key is set', () => {
    readFile.mockReturnValueOnce(`${KEY.toString('base64')}\n`)
    const { source, store } = resolveOrcadSecretStore({
      ...base,
      env: { CUBITO_SECRET_KEY_FILE: '/run/secrets/cubito' }
    })
    expect(readFile).toHaveBeenCalledWith('/run/secrets/cubito')
    expect(source).toBe('env-file')
    expect(store.describeProtectionGap()).toBeNull()
  })

  it('fails closed on a configured but invalid or unreadable key', () => {
    expect(() => resolveOrcadSecretStore({ ...base, env: { CUBITO_SECRET_KEY: 'nope' } })).toThrow(
      OrcadSecretKeyError
    )
    readFile.mockImplementationOnce(() => {
      throw new Error('ENOENT')
    })
    expect(() =>
      resolveOrcadSecretStore({ ...base, env: { CUBITO_SECRET_KEY_FILE: '/missing' } })
    ).toThrow(OrcadSecretKeyError)
  })

  it('reads an existing macOS Keychain master key without putting it on argv', () => {
    run.mockReturnValueOnce({ code: 0, stdout: `${KEY.toString('base64')}\n`, stderr: '' })
    const { source, store } = resolveOrcadSecretStore({ ...base, platform: 'darwin', env: {} })
    expect(source).toBe('keychain')
    expect(store.describeProtectionGap()).toBeNull()
    expect(run).toHaveBeenCalledWith(
      expect.objectContaining({
        program: '/usr/bin/security',
        args: expect.arrayContaining(['find-generic-password', '-w'])
      })
    )
  })

  it('creates a master key in the Keychain when none exists yet', () => {
    run.mockReset()
    run
      .mockReturnValueOnce({ code: 44, stdout: '', stderr: '' })
      .mockReturnValueOnce({ code: 0, stdout: '', stderr: '' })
    const { source } = resolveOrcadSecretStore({ ...base, platform: 'darwin', env: {} })
    expect(source).toBe('keychain')
    const addArgs = run.mock.calls[1]![0].args as string[]
    expect(addArgs).toContain('add-generic-password')
    const stored = addArgs[addArgs.indexOf('-w') + 1]!
    expect(Buffer.from(stored, 'base64')).toHaveLength(32)
  })

  it('re-reads the key when a concurrent orcad won the create race', () => {
    run.mockReset()
    run
      .mockReturnValueOnce({ code: 44, stdout: '', stderr: '' })
      .mockReturnValueOnce({ code: 45, stdout: '', stderr: '' })
      .mockReturnValueOnce({ code: 0, stdout: KEY.toString('base64'), stderr: '' })
    expect(resolveOrcadSecretStore({ ...base, platform: 'darwin', env: {} }).source).toBe(
      'keychain'
    )
  })

  it('degrades to unavailable with a reason when the Keychain cannot be used', () => {
    run.mockReset()
    run.mockReturnValue({ code: 36, stdout: '', stderr: 'locked' })
    const { source, store } = resolveOrcadSecretStore({ ...base, platform: 'darwin', env: {} })
    expect(source).toBe('none')
    expect(store.isEncryptionAvailable()).toBe(false)
    expect(store.describeProtectionGap()).toContain('Keychain')
    expect(() => store.encryptString('x')).toThrow('orcad_secret_sealing_unavailable')
  })

  it('degrades on a corrupt Keychain item rather than crashing startup', () => {
    run.mockReset()
    run.mockReturnValueOnce({ code: 0, stdout: 'garbage', stderr: '' })
    const { source, store } = resolveOrcadSecretStore({ ...base, platform: 'darwin', env: {} })
    expect(source).toBe('none')
    expect(store.describeProtectionGap()).toContain('Keychain')
  })

  it('is unavailable elsewhere and tells the operator how to fix it', () => {
    run.mockReset()
    const { source, store } = resolveOrcadSecretStore({ ...base, env: {} })
    expect(source).toBe('none')
    expect(store.describeProtectionGap()).toContain('CUBITO_SECRET_KEY')
    expect(run).not.toHaveBeenCalled()
  })
})

describe('createLazyOrcadSecretStore', () => {
  it('resolves once, on first use, and delegates to the resolved store', () => {
    const run = vi.fn()
    const lazy = createLazyOrcadSecretStore({
      env: { CUBITO_SECRET_KEY: KEY.toString('hex') },
      platform: 'darwin',
      run
    })
    expect(lazy.resolution).toBeDefined()
    const sealed = lazy.encryptString('s')
    expect(lazy.decryptString(sealed)).toBe('s')
    expect(lazy.resolution().source).toBe('env')
    expect(run).not.toHaveBeenCalled()
  })

  it('does not touch the Keychain until something asks', () => {
    const run = vi.fn().mockReturnValue({ code: 36, stdout: '', stderr: '' })
    const lazy = createLazyOrcadSecretStore({ env: {}, platform: 'darwin', run })
    expect(run).not.toHaveBeenCalled()
    lazy.isEncryptionAvailable()
    lazy.describeProtectionGap()
    expect(run).toHaveBeenCalledTimes(1)
  })
})

describe('exit code for a bad configured key', () => {
  it('is a configuration fault, so a supervisor does not restart-loop on it', () => {
    expect(resolveOrcadExitCode(new OrcadSecretKeyError('bad'))).toBe(78)
  })
})
