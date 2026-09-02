import { describe, expect, it } from 'vitest'
import { connectionFailureReason, pairingRejectionReason } from './connection-reason'
import type { PairingOfferRejection } from '../infrastructure/rpc/pairing-offer'

describe('pairingRejectionReason', () => {
  it.each<[PairingOfferRejection, string]>([
    ['too_long', 'código de pairing inválido'],
    ['not_a_pairing_url', 'código de pairing inválido'],
    ['malformed_code', 'código de pairing inválido'],
    ['not_json', 'código de pairing inválido'],
    ['missing_field', 'código de pairing inválido'],
    ['unsupported_version', 'versión de pairing no soportada'],
    ['relay_unsupported', 'pairing por relay no soportado']
  ])('maps %s to %s', (reason, expected) => {
    expect(pairingRejectionReason(reason)).toBe(expected)
  })

  it('never returns an empty string for any PairingOfferRejection', () => {
    const reasons: PairingOfferRejection[] = [
      'too_long',
      'not_a_pairing_url',
      'malformed_code',
      'not_json',
      'unsupported_version',
      'missing_field',
      'relay_unsupported'
    ]
    for (const reason of reasons) {
      expect(pairingRejectionReason(reason).length).toBeGreaterThan(0)
    }
  })
})

describe('connectionFailureReason', () => {
  it.each<[string, string]>([
    ['unauthorized', 'orcad rechazó el token'],
    ['remote_runtime_unavailable', 'orcad no responde'],
    ['connection_closed', 'orcad no responde'],
    ['rpc_timeout', 'orcad no responde'],
    ['invalid_runtime_response', 'respuesta inválida de orcad']
  ])('maps %s to %s', (code, expected) => {
    expect(connectionFailureReason(code)).toBe(expected)
  })

  it('never returns an empty string, even for an unrecognized code', () => {
    expect(connectionFailureReason('some_unknown_code').length).toBeGreaterThan(0)
  })

  it('never embeds a token, URL, or raw English message in any mapped reason', () => {
    const codes = [
      'unauthorized',
      'remote_runtime_unavailable',
      'connection_closed',
      'rpc_timeout',
      'invalid_runtime_response',
      'unknown_code'
    ]
    for (const code of codes) {
      expect(connectionFailureReason(code)).not.toMatch(/https?:\/\/|ws:\/\/|Bearer|token=/i)
    }
  })
})
