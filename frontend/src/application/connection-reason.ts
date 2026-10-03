import type { PairingOfferRejection } from '../infrastructure/rpc/pairing-offer'
import { t } from './i18n/translate'
import type { MessageKey } from './i18n/messages/en'

/** Pure code → localized reason lookup for `ConnectionState`'s `down.reason` (D6). Never leaks a token/URL. */

const PAIRING_REJECTION_REASONS: Record<PairingOfferRejection, MessageKey> = {
  too_long: 'connection.invalidPairing',
  not_a_pairing_url: 'connection.invalidPairing',
  malformed_code: 'connection.invalidPairing',
  not_json: 'connection.invalidPairing',
  missing_field: 'connection.invalidPairing',
  unsupported_version: 'connection.unsupportedVersion',
  relay_unsupported: 'connection.relayUnsupported'
}

export function pairingRejectionReason(reason: PairingOfferRejection): string {
  return t(PAIRING_REJECTION_REASONS[reason])
}

const CONNECTION_FAILURE_REASONS: Record<string, MessageKey> = {
  unauthorized: 'connection.tokenRejected',
  remote_runtime_unavailable: 'connection.unresponsive',
  connection_closed: 'connection.unresponsive',
  rpc_timeout: 'connection.unresponsive',
  invalid_runtime_response: 'connection.invalidResponse'
}

const UNKNOWN_FAILURE_REASON: MessageKey = 'connection.invalidResponse'

export function connectionFailureReason(code: string): string {
  return t(CONNECTION_FAILURE_REASONS[code] ?? UNKNOWN_FAILURE_REASON)
}
