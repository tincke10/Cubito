/** Per-connection sealed channel binding one shared key to `e2ee-box`, keeping key plumbing out of the protocol module. */
import { decrypt, decryptBytes, encrypt, encryptBytes } from './e2ee-box'

export type E2eeFrameCodec = {
  seal(plaintext: string): string
  open(frame: string): string | null
  sealBytes(bytes: Uint8Array): Uint8Array
  openBytes(frame: Uint8Array): Uint8Array | null
}

export function createE2eeFrameCodec(sharedKey: Uint8Array): E2eeFrameCodec {
  return {
    seal(plaintext: string): string {
      return encrypt(plaintext, sharedKey)
    },
    open(frame: string): string | null {
      return decrypt(frame, sharedKey)
    },
    sealBytes(bytes: Uint8Array): Uint8Array {
      return encryptBytes(bytes, sharedKey)
    },
    openBytes(frame: Uint8Array): Uint8Array | null {
      return decryptBytes(frame, sharedKey)
    }
  }
}
