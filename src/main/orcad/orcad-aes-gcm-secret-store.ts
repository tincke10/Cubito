import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import type { SecretStore } from '../../shared/secret-store'

const FORMAT_VERSION = 1
const IV_BYTES = 12
const TAG_BYTES = 16
const HEADER_BYTES = 1 + IV_BYTES + TAG_BYTES

/** AES-256-GCM sealing with a key the host supplies; layout is version | iv | tag | ciphertext. */
export function createAesGcmSecretStore(key: Buffer): SecretStore {
  return {
    isEncryptionAvailable: () => true,
    encryptString(plainText) {
      const iv = randomBytes(IV_BYTES)
      const cipher = createCipheriv('aes-256-gcm', key, iv)
      const body = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()])
      return Buffer.concat([Buffer.from([FORMAT_VERSION]), iv, cipher.getAuthTag(), body])
    },
    decryptString(sealed) {
      if (sealed.length < HEADER_BYTES || sealed[0] !== FORMAT_VERSION) {
        throw new Error('orcad_secret_unreadable')
      }
      const iv = sealed.subarray(1, 1 + IV_BYTES)
      const tag = sealed.subarray(1 + IV_BYTES, HEADER_BYTES)
      const decipher = createDecipheriv('aes-256-gcm', key, iv)
      decipher.setAuthTag(tag)
      return Buffer.concat([
        decipher.update(sealed.subarray(HEADER_BYTES)),
        decipher.final()
      ]).toString('utf8')
    },
    describeProtectionGap: () => null
  }
}
