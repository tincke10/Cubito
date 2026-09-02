/** Binary-safe base64 helpers built on atob/btoa — no Buffer (kept out of the vite bundle). */

const BASE64_CHUNK = 0x8000

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += BASE64_CHUNK) {
    const chunk = bytes.subarray(offset, offset + BASE64_CHUNK)
    binary += String.fromCharCode.apply(null, chunk as unknown as number[])
  }
  return btoa(binary)
}

/** Throws `InvalidCharacterError` on malformed input — raw atob behavior, unlike lenient `Buffer.from`. */
export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
}

/** Decodes a base64url payload (pairing codes) to a UTF-8 string. */
export function base64UrlToUtf8(base64url: string): string {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
  return new TextDecoder().decode(base64ToBytes(padded))
}
