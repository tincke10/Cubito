/**
 * Browser port of `src/shared/pairing.ts` — hand-rolled (no zod), result-returning
 * so a malformed/hostile pairing code can never throw or leak credentials via a stack trace.
 */
import { base64UrlToUtf8 } from './base64-binary'

export const PAIRING_CODE_MAX_CHARACTERS = 128 * 1024
export const PAIRING_INPUT_MAX_CHARACTERS = PAIRING_CODE_MAX_CHARACTERS + 1024
export const PAIRING_ENDPOINT_MAX_CHARACTERS = 16 * 1024
export const PAIRING_DEVICE_TOKEN_MAX_CHARACTERS = 64 * 1024
export const PAIRING_PUBLIC_KEY_MAX_CHARACTERS = 4 * 1024

const PAIRING_OFFER_VERSION = 2
const BASE64URL_CODE_PATTERN = /^[A-Za-z0-9+/_-]+={0,2}$/

export type PairingScope = 'mobile' | 'runtime'

export type PairingOffer = {
  v: 2
  endpoint: string
  deviceToken: string
  publicKeyB64: string
  pairedDeviceId?: string
  scope?: PairingScope
}

export type PairingOfferRejection =
  | 'too_long'
  | 'not_a_pairing_url'
  | 'malformed_code'
  | 'not_json'
  | 'unsupported_version'
  | 'missing_field'
  | 'relay_unsupported'

export type PairingOfferParseResult =
  | { ok: true; offer: PairingOffer }
  | { ok: false; reason: PairingOfferRejection }

function reject(reason: PairingOfferRejection): PairingOfferParseResult {
  return { ok: false, reason }
}

export function parsePairingCode(input: string): PairingOfferParseResult {
  if (input.length > PAIRING_INPUT_MAX_CHARACTERS) {
    return reject('too_long')
  }
  const trimmed = input.trim()
  if (!trimmed) {
    return reject('malformed_code')
  }
  if (trimmed.toLowerCase().startsWith('orca://')) {
    return parsePairingUrl(trimmed)
  }
  return parsePairingBase64(trimmed)
}

function parsePairingUrl(input: string): PairingOfferParseResult {
  let parsed: URL
  try {
    parsed = new URL(input)
  } catch {
    return reject('not_a_pairing_url')
  }
  if (parsed.protocol !== 'orca:' || parsed.hostname !== 'pair') {
    return reject('not_a_pairing_url')
  }
  if (parsed.pathname !== '' && parsed.pathname !== '/') {
    return reject('not_a_pairing_url')
  }
  const code = parsed.searchParams.get('code') ?? (parsed.hash ? parsed.hash.slice(1) : null)
  if (!code) {
    return reject('not_a_pairing_url')
  }
  return parsePairingBase64(code)
}

function parsePairingBase64(base64url: string): PairingOfferParseResult {
  if (base64url.length === 0 || base64url.length > PAIRING_CODE_MAX_CHARACTERS) {
    return reject('too_long')
  }
  if (!BASE64URL_CODE_PATTERN.test(base64url)) {
    return reject('malformed_code')
  }
  let json: string
  try {
    json = base64UrlToUtf8(base64url)
  } catch {
    return reject('malformed_code')
  }
  let raw: unknown
  try {
    raw = JSON.parse(json)
  } catch {
    return reject('not_json')
  }
  return validateOffer(raw)
}

type FieldResult =
  | { ok: true; value: string }
  | { ok: false; reason: 'missing_field' | 'too_long' }

function requireString(value: unknown, maxLength: number): FieldResult {
  if (typeof value !== 'string' || value.length === 0) {
    return { ok: false, reason: 'missing_field' }
  }
  if (value.length > maxLength) {
    return { ok: false, reason: 'too_long' }
  }
  return { ok: true, value }
}

function validateOffer(raw: unknown): PairingOfferParseResult {
  if (typeof raw !== 'object' || raw === null) {
    return reject('not_json')
  }
  const value = raw as Record<string, unknown>

  if (value.relay !== undefined) {
    return reject('relay_unsupported')
  }
  if (value.v !== PAIRING_OFFER_VERSION) {
    return reject('unsupported_version')
  }

  const endpoint = requireString(value.endpoint, PAIRING_ENDPOINT_MAX_CHARACTERS)
  if (!endpoint.ok) return reject(endpoint.reason)
  const deviceToken = requireString(value.deviceToken, PAIRING_DEVICE_TOKEN_MAX_CHARACTERS)
  if (!deviceToken.ok) return reject(deviceToken.reason)
  const publicKeyB64 = requireString(value.publicKeyB64, PAIRING_PUBLIC_KEY_MAX_CHARACTERS)
  if (!publicKeyB64.ok) return reject(publicKeyB64.reason)

  const offer: PairingOffer = {
    v: 2,
    endpoint: endpoint.value,
    deviceToken: deviceToken.value,
    publicKeyB64: publicKeyB64.value
  }
  if (typeof value.pairedDeviceId === 'string') {
    offer.pairedDeviceId = value.pairedDeviceId
  }
  if (value.scope === 'mobile' || value.scope === 'runtime') {
    offer.scope = value.scope
  }
  return { ok: true, offer }
}
