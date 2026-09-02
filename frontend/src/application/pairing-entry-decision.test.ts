import { describe, expect, it } from 'vitest'
import { decidePairingEntry } from './pairing-entry-decision'
import { bytesToBase64 } from '../infrastructure/rpc/base64-binary'

function encodeOffer(offer: unknown): string {
  const json = JSON.stringify(offer)
  const bytes = new TextEncoder().encode(json)
  return bytesToBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

const validOfferShape = {
  v: 2,
  endpoint: 'ws://127.0.0.1:5170',
  deviceToken: 'device-token',
  publicKeyB64: 'A'.repeat(43) + 'A'
}

describe('decidePairingEntry', () => {
  it('falls back to demo mode when there is no pairing fragment', () => {
    expect(decidePairingEntry(null)).toEqual({ kind: 'demo', reason: 'modo demo' })
  })

  it('connects when the fragment carries a valid offer', () => {
    const fragment = encodeOffer(validOfferShape)
    expect(decidePairingEntry(fragment)).toEqual({
      kind: 'connect',
      offer: { v: 2, endpoint: validOfferShape.endpoint, deviceToken: validOfferShape.deviceToken, publicKeyB64: validOfferShape.publicKeyB64 }
    })
  })

  it('falls back to demo mode with pairing por relay no soportado for a relay-bearing offer (CO-405)', () => {
    const fragment = encodeOffer({ ...validOfferShape, relay: { v: 1 } })
    expect(decidePairingEntry(fragment)).toEqual({ kind: 'demo', reason: 'pairing por relay no soportado' })
  })

  const rejectionCases: Array<{ name: string; fragment: string; reason: string }> = [
    { name: 'too_long', fragment: 'a'.repeat(200_000), reason: 'código de pairing inválido' },
    {
      name: 'not_a_pairing_url',
      fragment: `orca://notpair?code=${encodeOffer(validOfferShape)}`,
      reason: 'código de pairing inválido'
    },
    { name: 'malformed_code', fragment: 'not-valid!!!base64===', reason: 'código de pairing inválido' },
    {
      name: 'not_json',
      fragment: bytesToBase64(new TextEncoder().encode('not json at all'))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, ''),
      reason: 'código de pairing inválido'
    },
    { name: 'unsupported_version', fragment: encodeOffer({ ...validOfferShape, v: 3 }), reason: 'versión de pairing no soportada' },
    {
      name: 'missing_field',
      fragment: encodeOffer({ v: 2, endpoint: validOfferShape.endpoint, publicKeyB64: validOfferShape.publicKeyB64 }),
      reason: 'código de pairing inválido'
    }
  ]

  for (const { name, fragment, reason } of rejectionCases) {
    it(`maps ${name} to demo mode with reason '${reason}' (CO-404)`, () => {
      expect(decidePairingEntry(fragment)).toEqual({ kind: 'demo', reason })
    })
  }

  it('never throws on garbage input', () => {
    for (const input of ['', '💥💥💥', '{not json', 'orca://pair', ' ']) {
      expect(() => decidePairingEntry(input)).not.toThrow()
    }
  })
})
