export const ORCAD_SECRET_KEY_BYTES = 32

export class OrcadSecretKeyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'OrcadSecretKeyError'
  }
}

const HEX_KEY = /^[0-9a-f]{64}$/i
const BASE64_KEY = /^[A-Za-z0-9+/_-]+={0,2}$/

/** Parses a 32-byte key given as hex or base64/base64url; the error never echoes the value. */
export function parseOrcadSecretKey(raw: string): Buffer {
  const text = raw.trim()
  let key: Buffer | null = null
  if (HEX_KEY.test(text)) {
    key = Buffer.from(text, 'hex')
  } else if (BASE64_KEY.test(text)) {
    key = Buffer.from(text, 'base64')
  }
  if (key?.length !== ORCAD_SECRET_KEY_BYTES) {
    throw new OrcadSecretKeyError(
      `The secret key must be ${ORCAD_SECRET_KEY_BYTES} bytes encoded as 64 hex characters or base64 (for example: openssl rand -base64 32).`
    )
  }
  return key
}
