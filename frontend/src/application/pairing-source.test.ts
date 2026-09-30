import { describe, expect, it } from 'vitest'
import { bytesToBase64 } from '../infrastructure/rpc/base64-binary'
import { PAIRING_STORAGE_KEY, clearStoredPairing, resolvePairingSource } from './pairing-source'

const encodeOffer = (offer: unknown): string =>
  bytesToBase64(new TextEncoder().encode(JSON.stringify(offer)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

const VALID = encodeOffer({
  v: 2,
  endpoint: 'ws://127.0.0.1:5170',
  deviceToken: 'device-token',
  publicKeyB64: 'A'.repeat(44)
})

const memoryStorage = (initial: Record<string, string> = {}) => {
  const data = new Map(Object.entries(initial))
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key)
  }
}

const throwingStorage = {
  getItem: () => {
    throw new Error('blocked')
  },
  setItem: () => {
    throw new Error('blocked')
  },
  removeItem: () => {
    throw new Error('blocked')
  }
}

describe('resolvePairingSource', () => {
  it('persists a valid fragment and returns it', () => {
    const storage = memoryStorage()
    expect(resolvePairingSource(VALID, storage)).toBe(VALID)
    expect(storage.data.get(PAIRING_STORAGE_KEY)).toBe(VALID)
  })

  it('falls back to the stored pairing when the URL carries no fragment (reload)', () => {
    const storage = memoryStorage({ [PAIRING_STORAGE_KEY]: VALID })
    expect(resolvePairingSource(null, storage)).toBe(VALID)
  })

  it('does not persist an invalid fragment nor let it overwrite a stored valid one', () => {
    const storage = memoryStorage({ [PAIRING_STORAGE_KEY]: VALID })
    expect(resolvePairingSource('garbage', storage)).toBe('garbage')
    expect(storage.data.get(PAIRING_STORAGE_KEY)).toBe(VALID)
  })

  it('drops a stored value that no longer parses', () => {
    const storage = memoryStorage({ [PAIRING_STORAGE_KEY]: 'garbage' })
    expect(resolvePairingSource(null, storage)).toBeNull()
    expect(storage.data.has(PAIRING_STORAGE_KEY)).toBe(false)
  })

  it('works without storage or with storage that throws', () => {
    expect(resolvePairingSource(VALID, null)).toBe(VALID)
    expect(resolvePairingSource(null, null)).toBeNull()
    expect(resolvePairingSource(VALID, throwingStorage)).toBe(VALID)
    expect(resolvePairingSource(null, throwingStorage)).toBeNull()
  })
})

describe('clearStoredPairing', () => {
  it('removes the stored pairing and tolerates missing or throwing storage', () => {
    const storage = memoryStorage({ [PAIRING_STORAGE_KEY]: VALID })
    clearStoredPairing(storage)
    expect(storage.data.has(PAIRING_STORAGE_KEY)).toBe(false)
    expect(() => clearStoredPairing(null)).not.toThrow()
    expect(() => clearStoredPairing(throwingStorage)).not.toThrow()
  })
})
