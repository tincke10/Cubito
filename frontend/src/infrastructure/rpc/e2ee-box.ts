/**
 * Browser port of `src/shared/e2ee-crypto.ts` — same NaCl box wire format
 * (base64(nonce24 ‖ box)), swapping `Buffer` for the atob/btoa-based `base64-binary`.
 */
import nacl from 'tweetnacl'
import { base64ToBytes, bytesToBase64 } from './base64-binary'

const MAX_E2EE_TEXT_PLAINTEXT_BYTES = 4 * 1024 * 1024
const E2EE_FRAME_OVERHEAD_BYTES = nacl.box.nonceLength + nacl.box.overheadLength
export const MAX_E2EE_ENCRYPTED_BASE64_CHARACTERS =
  Math.ceil((MAX_E2EE_TEXT_PLAINTEXT_BYTES + E2EE_FRAME_OVERHEAD_BYTES) / 3) * 4

export type E2eeKeyPair = { publicKey: Uint8Array; secretKey: Uint8Array }

export function generateKeyPair(): E2eeKeyPair {
  const pair = nacl.box.keyPair()
  return { publicKey: pair.publicKey, secretKey: pair.secretKey }
}

export function deriveSharedKey(ourSecretKey: Uint8Array, peerPublicKey: Uint8Array): Uint8Array {
  return nacl.box.before(peerPublicKey, ourSecretKey)
}

export function publicKeyFromBase64(b64: string): Uint8Array {
  if (b64.length > 44) {
    throw new Error('Invalid public key: encoded value is too large')
  }
  let key: Uint8Array
  try {
    key = base64ToBytes(b64)
  } catch {
    throw new Error('Invalid public key: malformed base64')
  }
  if (key.length !== 32) {
    throw new Error(`Invalid public key: expected 32 bytes, got ${key.length}`)
  }
  return key
}

export function publicKeyToBase64(key: Uint8Array): string {
  return bytesToBase64(key)
}

export function encrypt(plaintext: string, sharedKey: Uint8Array): string {
  const messageBytes = new TextEncoder().encode(plaintext)
  const nonce = nacl.randomBytes(nacl.box.nonceLength)
  const ciphertext = nacl.box.after(messageBytes, nonce, sharedKey)
  const bundle = new Uint8Array(nonce.length + ciphertext.length)
  bundle.set(nonce)
  bundle.set(ciphertext, nonce.length)
  return bytesToBase64(bundle)
}

/** Never throws — malformed/truncated/oversize input maps to `null`, same contract as the engine port. */
export function decrypt(encrypted: string, sharedKey: Uint8Array): string | null {
  if (encrypted.length > MAX_E2EE_ENCRYPTED_BASE64_CHARACTERS) {
    return null
  }
  let bundle: Uint8Array
  try {
    bundle = base64ToBytes(encrypted)
  } catch {
    // atob throws InvalidCharacterError on non-base64 input; Buffer.from is lenient — normalize to null here.
    return null
  }
  if (bundle.length < nacl.box.nonceLength + nacl.box.overheadLength) {
    return null
  }
  const nonce = bundle.slice(0, nacl.box.nonceLength)
  const ciphertext = bundle.slice(nacl.box.nonceLength)
  const plaintext = nacl.box.open.after(ciphertext, nonce, sharedKey)
  if (!plaintext) {
    return null
  }
  return new TextDecoder().decode(plaintext)
}
