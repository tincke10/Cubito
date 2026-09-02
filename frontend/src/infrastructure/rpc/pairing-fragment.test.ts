import { describe, expect, it } from 'vitest'
import { readPairingFragment } from './pairing-fragment'

describe('readPairingFragment', () => {
  it('decodes the #pairing=<encoded> fragment exactly as createWebClientUrl emits it', () => {
    const pairingUrl = 'orca://pair?code=abc'
    const hash = '#pairing=' + encodeURIComponent(pairingUrl)
    expect(readPairingFragment(hash)).toBe(pairingUrl)
  })

  it('returns null for an empty hash', () => {
    expect(readPairingFragment('')).toBeNull()
  })

  it('returns null when the hash carries a different key', () => {
    expect(readPairingFragment('#other=x')).toBeNull()
  })

  it('returns null when the hash has no leading #', () => {
    expect(readPairingFragment('pairing=' + encodeURIComponent('orca://pair?code=abc'))).toBeNull()
  })

  it('never throws on malformed percent-encoding, returns null instead', () => {
    expect(() => readPairingFragment('#pairing=%')).not.toThrow()
    expect(readPairingFragment('#pairing=%')).toBeNull()
    expect(() => readPairingFragment('#pairing=%E0%A4%A')).not.toThrow()
    expect(readPairingFragment('#pairing=%E0%A4%A')).toBeNull()
  })

  it('returns null for an empty pairing value', () => {
    expect(readPairingFragment('#pairing=')).toBeNull()
  })
})
