/**
 * Wire codec for the orcad runtime RPC envelope.
 *
 * Mirrors `src/shared/runtime-rpc-envelope.ts` in the engine: responses are
 * `{id, ok, result|error, _meta}` plus `{_keepalive: true}` frames, and both
 * sides strip additive fields so client and runtime can version independently.
 */

export type RpcRequestFrame = {
  id: string
  deviceToken: string
  method: string
  params?: unknown
}

export type RpcSuccessFrame = {
  id: string
  ok: true
  result: unknown
  _meta: { runtimeId: string }
}

export type RpcFailureFrame = {
  id: string
  ok: false
  error: { code: string; message: string; data?: unknown }
  _meta?: { runtimeId: string | null }
}

export type RpcResponseFrame = RpcSuccessFrame | RpcFailureFrame

export type DecodedRpcFrame =
  | { kind: 'response'; response: RpcResponseFrame }
  | { kind: 'stream'; response: RpcSuccessFrame }
  | { kind: 'keepalive' }
  | { kind: 'invalid'; reason: string }

export function encodeRpcRequest(request: RpcRequestFrame): string {
  const frame: Record<string, unknown> = {
    id: request.id,
    deviceToken: request.deviceToken,
    method: request.method
  }
  if (request.params !== undefined) {
    frame.params = request.params
  }
  return JSON.stringify(frame)
}

export function decodeRpcFrame(raw: string): DecodedRpcFrame {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { kind: 'invalid', reason: 'not_json' }
  }
  if (typeof parsed !== 'object' || parsed === null) {
    return { kind: 'invalid', reason: 'not_an_object' }
  }
  const frame = parsed as Record<string, unknown>

  if (frame._keepalive === true) {
    return { kind: 'keepalive' }
  }
  if (typeof frame.id !== 'string') {
    return { kind: 'invalid', reason: 'missing_id' }
  }

  if (frame.ok === true) {
    const meta = frame._meta as Record<string, unknown> | undefined
    if (typeof meta?.runtimeId !== 'string') {
      return { kind: 'invalid', reason: 'missing_runtime_id' }
    }
    const response: RpcSuccessFrame = {
      id: frame.id,
      ok: true,
      result: frame.result,
      _meta: { runtimeId: meta.runtimeId }
    }
    // terminal.multiplex-style streaming RPCs reuse the request id across many emits — decode
    // separately so RpcConnection doesn't resolve+delete the pending call on the first one.
    if (frame.streaming === true) {
      return { kind: 'stream', response }
    }
    return { kind: 'response', response }
  }

  if (frame.ok === false) {
    const error = frame.error as Record<string, unknown> | undefined
    if (typeof error?.code !== 'string' || typeof error.message !== 'string') {
      return { kind: 'invalid', reason: 'malformed_error' }
    }
    const failure: RpcFailureFrame = {
      id: frame.id,
      ok: false,
      error: { code: error.code, message: error.message, data: error.data }
    }
    return { kind: 'response', response: failure }
  }

  return { kind: 'invalid', reason: 'unknown_frame' }
}
