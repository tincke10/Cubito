/** Pure exponential-backoff policy for socket-level reconnection (no timers, no I/O). */

export const RECONNECT_INITIAL_DELAY_MS = 500
export const RECONNECT_FACTOR = 2
export const RECONNECT_CAP_MS = 15_000
export const RECONNECT_MAX_ATTEMPTS = 8
export const RECONNECT_JITTER_RATIO = 0.3

const NON_RETRYABLE_CODES = new Set([
  'unauthorized',
  'too_long',
  'not_a_pairing_url',
  'malformed_code',
  'not_json',
  'unsupported_version',
  'missing_field',
  'relay_unsupported'
])

/** `base = min(CAP, INITIAL * FACTOR^(attempt-1))`; delay = `round(base * (1 - R/2 + random()*R))`. */
export function reconnectDelayMs(attempt: number, random: () => number = Math.random): number {
  const base = Math.min(RECONNECT_CAP_MS, RECONNECT_INITIAL_DELAY_MS * RECONNECT_FACTOR ** (attempt - 1))
  const jitterFactor = 1 - RECONNECT_JITTER_RATIO / 2 + random() * RECONNECT_JITTER_RATIO
  return Math.round(base * jitterFactor)
}

/** Reconnecting a host mid-restart is worth retrying; a rejected token or malformed offer is not. */
export function isRetryableFailure(code: string): boolean {
  return !NON_RETRYABLE_CODES.has(code)
}
