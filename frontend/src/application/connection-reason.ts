import type { PairingOfferRejection } from '../infrastructure/rpc/pairing-offer'

/** Pure code → Spanish reason lookup for `ConnectionState`'s `down.reason` (D6). Never leaks a token/URL/raw English. */

const PAIRING_REJECTION_REASONS: Record<PairingOfferRejection, string> = {
  too_long: 'código de pairing inválido',
  not_a_pairing_url: 'código de pairing inválido',
  malformed_code: 'código de pairing inválido',
  not_json: 'código de pairing inválido',
  missing_field: 'código de pairing inválido',
  unsupported_version: 'versión de pairing no soportada',
  relay_unsupported: 'pairing por relay no soportado'
}

export function pairingRejectionReason(reason: PairingOfferRejection): string {
  return PAIRING_REJECTION_REASONS[reason]
}

const CONNECTION_FAILURE_REASONS: Record<string, string> = {
  unauthorized: 'orcad rechazó el token',
  remote_runtime_unavailable: 'orcad no responde',
  connection_closed: 'orcad no responde',
  rpc_timeout: 'orcad no responde',
  invalid_runtime_response: 'respuesta inválida de orcad'
}

const UNKNOWN_FAILURE_REASON = 'respuesta inválida de orcad'

export function connectionFailureReason(code: string): string {
  return CONNECTION_FAILURE_REASONS[code] ?? UNKNOWN_FAILURE_REASON
}
