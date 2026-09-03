import { describe, expect, it } from 'vitest'
import { createE2eeFrameCodec } from './e2ee-frame-codec'
import { deriveSharedKey, generateKeyPair } from './e2ee-box'

function pairedSharedKey(): Uint8Array {
  const a = generateKeyPair()
  const b = generateKeyPair()
  return deriveSharedKey(a.secretKey, b.publicKey)
}

describe('createE2eeFrameCodec', () => {
  it('round-trips a plaintext through seal/open', () => {
    const codec = createE2eeFrameCodec(pairedSharedKey())
    const plaintext = '{"type":"e2ee_auth","deviceToken":"tok","clientCapabilities":[]}'
    expect(codec.open(codec.seal(plaintext))).toBe(plaintext)
  })

  it('returns null (never throws) opening a corrupted frame', () => {
    const codec = createE2eeFrameCodec(pairedSharedKey())
    expect(() => codec.open('not-a-valid-frame!!!')).not.toThrow()
    expect(codec.open('not-a-valid-frame!!!')).toBeNull()
  })

  it('returns null opening a frame sealed under a foreign key', () => {
    const codec = createE2eeFrameCodec(pairedSharedKey())
    const foreignCodec = createE2eeFrameCodec(pairedSharedKey())
    const sealed = foreignCodec.seal('hello')
    expect(codec.open(sealed)).toBeNull()
  })

  it('produces different ciphertext for two seal() calls of the same plaintext (fresh nonce)', () => {
    const codec = createE2eeFrameCodec(pairedSharedKey())
    expect(codec.seal('same')).not.toBe(codec.seal('same'))
  })

  it('round-trips a raw binary frame through sealBytes/openBytes', () => {
    const codec = createE2eeFrameCodec(pairedSharedKey())
    const bytes = new Uint8Array([0, 1, 2, 127, 128, 254, 255])
    expect(codec.openBytes(codec.sealBytes(bytes))).toEqual(bytes)
  })

  it('returns null (never throws) opening a corrupted binary frame', () => {
    const codec = createE2eeFrameCodec(pairedSharedKey())
    expect(() => codec.openBytes(new Uint8Array([1, 2, 3]))).not.toThrow()
    expect(codec.openBytes(new Uint8Array([1, 2, 3]))).toBeNull()
  })

  it('returns null opening a binary frame sealed under a foreign key', () => {
    const codec = createE2eeFrameCodec(pairedSharedKey())
    const foreignCodec = createE2eeFrameCodec(pairedSharedKey())
    const sealed = foreignCodec.sealBytes(new Uint8Array([9, 9, 9]))
    expect(codec.openBytes(sealed)).toBeNull()
  })
})
