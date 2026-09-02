import { describe, expect, it } from 'vitest'
import {
  RECONNECT_CAP_MS,
  RECONNECT_INITIAL_DELAY_MS,
  RECONNECT_JITTER_RATIO,
  RECONNECT_MAX_ATTEMPTS,
  isRetryableFailure,
  reconnectDelayMs
} from './reconnect-backoff'

describe('reconnectDelayMs', () => {
  it('bounds the jitter range at random()=0 and random()=1 for a given attempt', () => {
    const attempt = 3
    const base = Math.min(RECONNECT_CAP_MS, RECONNECT_INITIAL_DELAY_MS * 2 ** (attempt - 1))
    const min = Math.round(base * (1 - RECONNECT_JITTER_RATIO / 2))
    const max = Math.round(base * (1 - RECONNECT_JITTER_RATIO / 2 + RECONNECT_JITTER_RATIO))
    expect(reconnectDelayMs(attempt, () => 0)).toBe(min)
    expect(reconnectDelayMs(attempt, () => 1)).toBe(max)
  })

  it('with random: () => 0.5 (base unmodified), attempts 1..8 match the pinned sequence', () => {
    const expected = [500, 1000, 2000, 4000, 8000, 15000, 15000, 15000]
    const actual = Array.from({ length: RECONNECT_MAX_ATTEMPTS }, (_, i) =>
      reconnectDelayMs(i + 1, () => 0.5)
    )
    expect(actual).toEqual(expected)
  })
})

describe('isRetryableFailure', () => {
  it('treats socket/handshake/rpc transient codes as retryable', () => {
    expect(isRetryableFailure('remote_runtime_unavailable')).toBe(true)
    expect(isRetryableFailure('connection_closed')).toBe(true)
    expect(isRetryableFailure('rpc_timeout')).toBe(true)
    expect(isRetryableFailure('invalid_runtime_response')).toBe(true)
  })

  it('treats unauthorized as non-retryable', () => {
    expect(isRetryableFailure('unauthorized')).toBe(false)
  })

  it('treats every PairingOfferRejection reason as non-retryable', () => {
    const rejections = [
      'too_long',
      'not_a_pairing_url',
      'malformed_code',
      'not_json',
      'unsupported_version',
      'missing_field',
      'relay_unsupported'
    ]
    for (const reason of rejections) {
      expect(isRetryableFailure(reason)).toBe(false)
    }
  })
})
