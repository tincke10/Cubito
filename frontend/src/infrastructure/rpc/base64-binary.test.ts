import { describe, expect, it } from 'vitest'
import { bytesToBase64, base64ToBytes, base64UrlToUtf8 } from './base64-binary'

describe('bytesToBase64 / base64ToBytes', () => {
  it('round-trips a small buffer', () => {
    const bytes = new Uint8Array([0, 1, 2, 253, 254, 255])
    expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes)
  })

  it('round-trips a random buffer', () => {
    const bytes = new Uint8Array(4096)
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256)
    expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes)
  })

  it('round-trips a 5MB buffer without RangeError (chunked encoding)', () => {
    const bytes = new Uint8Array(5 * 1024 * 1024)
    for (let i = 0; i < bytes.length; i += 997) bytes[i] = i % 256
    expect(() => bytesToBase64(bytes)).not.toThrow()
    const roundTripped = base64ToBytes(bytesToBase64(bytes))
    expect(roundTripped.length).toBe(bytes.length)
    let mismatchIndex = -1
    for (let i = 0; i < bytes.length; i += 1) {
      if (roundTripped[i] !== bytes[i]) {
        mismatchIndex = i
        break
      }
    }
    expect(mismatchIndex).toBe(-1)
  })

  it('throws on a string containing non-base64 characters (raw atob behavior)', () => {
    expect(() => base64ToBytes('!!!not-base64!!!')).toThrow()
  })
})

describe('base64UrlToUtf8', () => {
  it('decodes a known base64url sample to the expected UTF-8 string', () => {
    expect(base64UrlToUtf8('Y2Fmw6kg4piV')).toBe('café ☕')
  })
})
