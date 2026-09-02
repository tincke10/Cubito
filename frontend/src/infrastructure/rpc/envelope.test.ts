import { describe, expect, it } from 'vitest'
import { decodeRpcFrame, encodeRpcRequest } from './envelope'

describe('encodeRpcRequest', () => {
  it('serializes id, deviceToken, method and params', () => {
    const raw = encodeRpcRequest({
      id: 'req-1',
      deviceToken: 'tok',
      method: 'worktree.list',
      params: { repoId: 'r1' }
    })
    expect(JSON.parse(raw)).toEqual({
      id: 'req-1',
      deviceToken: 'tok',
      method: 'worktree.list',
      params: { repoId: 'r1' }
    })
  })

  it('omits params when not provided', () => {
    const raw = encodeRpcRequest({ id: 'req-2', deviceToken: 'tok', method: 'session.status' })
    expect(JSON.parse(raw)).toEqual({ id: 'req-2', deviceToken: 'tok', method: 'session.status' })
  })

  // CO-301/CO-302 regression: the WS dispatcher (runtime-rpc.ts:1690-1738) reads `deviceToken`,
  // not `authToken` — that field is the unrelated unix-socket shared token.
  it('sends deviceToken, not authToken, on every call envelope', () => {
    const raw = encodeRpcRequest({ id: 'req-3', deviceToken: 'tok', method: 'worktree.list' })
    const parsed = JSON.parse(raw)
    expect(parsed.deviceToken).toBe('tok')
    expect(parsed.authToken).toBeUndefined()
  })
})

describe('decodeRpcFrame', () => {
  it('decodes a success envelope', () => {
    const frame = decodeRpcFrame(
      JSON.stringify({ id: 'a', ok: true, result: { n: 1 }, _meta: { runtimeId: 'rt' } })
    )
    expect(frame).toEqual({
      kind: 'response',
      response: { id: 'a', ok: true, result: { n: 1 }, _meta: { runtimeId: 'rt' } }
    })
  })

  it('decodes a failure envelope', () => {
    const frame = decodeRpcFrame(
      JSON.stringify({ id: 'a', ok: false, error: { code: 'repo_not_found', message: 'nope' } })
    )
    expect(frame.kind).toBe('response')
    if (frame.kind !== 'response' || frame.response.ok) {
      throw new Error('expected failure response')
    }
    expect(frame.response.error.code).toBe('repo_not_found')
  })

  it('recognizes keepalive frames', () => {
    expect(decodeRpcFrame(JSON.stringify({ _keepalive: true }))).toEqual({ kind: 'keepalive' })
  })

  it('tolerates unknown additive fields on a response', () => {
    const frame = decodeRpcFrame(
      JSON.stringify({
        id: 'a',
        ok: true,
        result: null,
        _meta: { runtimeId: 'rt' },
        futureField: 'ignored'
      })
    )
    expect(frame.kind).toBe('response')
  })

  it('rejects non-JSON input', () => {
    expect(decodeRpcFrame('not json').kind).toBe('invalid')
  })

  it('rejects a frame without an id or keepalive marker', () => {
    expect(decodeRpcFrame(JSON.stringify({ ok: true })).kind).toBe('invalid')
  })

  it('rejects a failure envelope without an error object', () => {
    expect(decodeRpcFrame(JSON.stringify({ id: 'a', ok: false })).kind).toBe('invalid')
  })
})
