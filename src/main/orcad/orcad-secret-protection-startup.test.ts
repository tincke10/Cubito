import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { _resetSecretStoreForTests, setSecretStore } from '../../shared/secret-store'
import { createLazyOrcadSecretStore } from './orcad-secret-store'
import { reportOrcadSecretProtection } from './orcad-secret-protection-startup'

const KEY_HEX = 'ab'.repeat(32)
let root = ''

afterEach(() => {
  _resetSecretStoreForTests()
  if (root) {
    rmSync(root, { recursive: true, force: true })
  }
})

function setup(env: NodeJS.ProcessEnv) {
  root = mkdtempSync(join(tmpdir(), 'orcad-secret-report-'))
  const store = createLazyOrcadSecretStore({ env, platform: 'linux' })
  setSecretStore(store)
  const log = vi.fn()
  return { store, log }
}

describe('reportOrcadSecretProtection', () => {
  it('says credentials are sealed and names the key source, never the key', () => {
    const { store, log } = setup({ CUBITO_SECRET_KEY: KEY_HEX })
    reportOrcadSecretProtection({ store, userDataPath: root, log })
    const output = log.mock.calls.map((call) => String(call[0])).join('\n')
    expect(output).toContain('sealed')
    expect(output).toContain('CUBITO_SECRET_KEY')
    expect(output).not.toContain(KEY_HEX)
  })

  it('reports the gap on every start, including when it was reported before', () => {
    const { store, log } = setup({})
    reportOrcadSecretProtection({ store, userDataPath: root, log })
    reportOrcadSecretProtection({ store, userDataPath: root, log })
    const gapLines = log.mock.calls.filter((call) => String(call[0]).includes('stored unencrypted'))
    expect(gapLines).toHaveLength(2)
  })

  it('propagates a bad configured key so the launch fails closed', () => {
    const { store, log } = setup({ CUBITO_SECRET_KEY: 'short' })
    expect(() => reportOrcadSecretProtection({ store, userDataPath: root, log })).toThrow(
      'secret key'
    )
  })
})
