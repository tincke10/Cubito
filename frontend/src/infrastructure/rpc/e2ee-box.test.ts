import { describe, expect, it } from 'vitest'
import {
  MAX_E2EE_ENCRYPTED_BASE64_CHARACTERS,
  decrypt,
  deriveSharedKey,
  encrypt,
  generateKeyPair,
  publicKeyFromBase64,
  publicKeyToBase64
} from './e2ee-box'
import { base64ToBytes } from './base64-binary'
import { ORCAD_WIRE_VECTORS } from './orcad-wire-vectors'

describe('generateKeyPair', () => {
  it('yields different keypairs, each 32 bytes, on every call (CO-101)', () => {
    const a = generateKeyPair()
    const b = generateKeyPair()
    expect(a.publicKey.length).toBe(32)
    expect(a.secretKey.length).toBe(32)
    expect(b.publicKey.length).toBe(32)
    expect(b.secretKey.length).toBe(32)
    expect(publicKeyToBase64(a.publicKey)).not.toBe(publicKeyToBase64(b.publicKey))
    expect(publicKeyToBase64(a.secretKey)).not.toBe(publicKeyToBase64(b.secretKey))
  })
})

describe('deriveSharedKey — cross-vector', () => {
  it('matches the engine-derived shared key from the committed vectors', () => {
    const clientSecretKey = base64ToBytes(ORCAD_WIRE_VECTORS.keys.clientSecretKeyB64)
    const serverPublicKey = base64ToBytes(ORCAD_WIRE_VECTORS.keys.serverPublicKeyB64)
    const sharedKey = deriveSharedKey(clientSecretKey, serverPublicKey)
    expect(publicKeyToBase64(sharedKey)).toBe(ORCAD_WIRE_VECTORS.keys.sharedKeyB64)
  })
})

describe('decrypt — cross-vector (engine-produced ciphertext)', () => {
  const sharedKey = base64ToBytes(ORCAD_WIRE_VECTORS.keys.sharedKeyB64)

  it('decrypts sealed.authenticated to handshake.authenticatedPlaintext', () => {
    expect(decrypt(ORCAD_WIRE_VECTORS.sealed.authenticated, sharedKey)).toBe(
      ORCAD_WIRE_VECTORS.handshake.authenticatedPlaintext
    )
  })

  it('decrypts sealed.unauthorized to handshake.unauthorizedPlaintext', () => {
    expect(decrypt(ORCAD_WIRE_VECTORS.sealed.unauthorized, sharedKey)).toBe(
      ORCAD_WIRE_VECTORS.handshake.unauthorizedPlaintext
    )
  })

  it('decrypts sealed.badAuth to handshake.badAuthPlaintext', () => {
    expect(decrypt(ORCAD_WIRE_VECTORS.sealed.badAuth, sharedKey)).toBe(
      ORCAD_WIRE_VECTORS.handshake.badAuthPlaintext
    )
  })

  it('decrypts sealed.rpcResponse to rpc.responsePlaintext', () => {
    expect(decrypt(ORCAD_WIRE_VECTORS.sealed.rpcResponse, sharedKey)).toBe(
      ORCAD_WIRE_VECTORS.rpc.responsePlaintext
    )
  })

  it('decrypts sealed.keepalive to rpc.keepalivePlaintext', () => {
    expect(decrypt(ORCAD_WIRE_VECTORS.sealed.keepalive, sharedKey)).toBe(
      ORCAD_WIRE_VECTORS.rpc.keepalivePlaintext
    )
  })

  it('returns null (not throw) on a truncated bundle (CO-110)', () => {
    expect(decrypt(ORCAD_WIRE_VECTORS.sealed.truncated, sharedKey)).toBeNull()
  })

  it('returns null on a bundle exceeding MAX_E2EE_ENCRYPTED_BASE64_CHARACTERS', () => {
    expect(ORCAD_WIRE_VECTORS.sealed.oversize.length).toBeGreaterThan(MAX_E2EE_ENCRYPTED_BASE64_CHARACTERS)
    expect(decrypt(ORCAD_WIRE_VECTORS.sealed.oversize, sharedKey)).toBeNull()
  })

  // D3 atob-strictness: `Buffer.from(s,'base64')` is lenient, `atob` throws `InvalidCharacterError`.
  // This is the concrete divergence-vs-Buffer.from this change must not regress on.
  it('returns null on non-base64 input instead of throwing InvalidCharacterError', () => {
    expect(() => decrypt(ORCAD_WIRE_VECTORS.sealed.nonBase64, sharedKey)).not.toThrow()
    expect(decrypt(ORCAD_WIRE_VECTORS.sealed.nonBase64, sharedKey)).toBeNull()
  })
})

describe('encrypt — round-trip and live-PRNG', () => {
  const sharedKey = base64ToBytes(ORCAD_WIRE_VECTORS.keys.sharedKeyB64)

  it('round-trips through this module’s own decrypt', () => {
    const plaintext = ORCAD_WIRE_VECTORS.rpc.requestPlaintext
    expect(decrypt(encrypt(plaintext, sharedKey), sharedKey)).toBe(plaintext)
  })

  it('produces different ciphertext for two calls with the same plaintext (fresh nonce, live PRNG)', () => {
    const plaintext = ORCAD_WIRE_VECTORS.handshake.readyPlaintext
    expect(encrypt(plaintext, sharedKey)).not.toBe(encrypt(plaintext, sharedKey))
  })

  it('lays out the bundle as base64(nonce24 ‖ box)', () => {
    const plaintext = 'café ☕'
    const utf8Length = new TextEncoder().encode(plaintext).length
    const bundle = base64ToBytes(encrypt(plaintext, sharedKey))
    expect(bundle.length).toBe(24 + utf8Length + 16)
  })
})

describe('publicKeyFromBase64', () => {
  it('round-trips a valid 32-byte public key', () => {
    const key = publicKeyFromBase64(ORCAD_WIRE_VECTORS.keys.serverPublicKeyB64)
    expect(key.length).toBe(32)
  })

  it('throws on a string longer than 44 characters', () => {
    expect(() => publicKeyFromBase64('A'.repeat(45))).toThrow()
  })

  it('throws when the decoded value is not 32 bytes', () => {
    // 16 zero bytes, base64-encoded — well under 44 chars, but decodes short.
    expect(() => publicKeyFromBase64('AAAAAAAAAAAAAAAAAAAAAA==')).toThrow()
  })
})
