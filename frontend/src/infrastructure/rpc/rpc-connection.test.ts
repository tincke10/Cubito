import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RpcCallError, RpcConnection } from './rpc-connection'
import type { RpcTransport } from './rpc-connection'

type FakeTransport = RpcTransport & {
  sent: string[]
  sentBinary: Uint8Array[]
  receive(raw: string): void
  receiveBinary(bytes: Uint8Array): void
  close(reason?: string): void
}

const createFakeTransport = (): FakeTransport => {
  const messageHandlers: ((data: string) => void)[] = []
  const closeHandlers: ((reason?: string) => void)[] = []
  const binaryHandlers: ((bytes: Uint8Array) => void)[] = []
  return {
    sent: [],
    sentBinary: [],
    send(data) {
      this.sent.push(data)
    },
    sendBinary(bytes) {
      this.sentBinary.push(bytes)
    },
    onMessage(cb) {
      messageHandlers.push(cb)
      return () => void messageHandlers.splice(messageHandlers.indexOf(cb), 1)
    },
    onBinary(cb) {
      binaryHandlers.push(cb)
      return () => void binaryHandlers.splice(binaryHandlers.indexOf(cb), 1)
    },
    onClose(cb) {
      closeHandlers.push(cb)
      return () => void closeHandlers.splice(closeHandlers.indexOf(cb), 1)
    },
    receive(raw) {
      for (const cb of [...messageHandlers]) cb(raw)
    },
    receiveBinary(bytes) {
      for (const cb of [...binaryHandlers]) cb(bytes)
    },
    close(reason) {
      for (const cb of [...closeHandlers]) cb(reason)
    }
  }
}

const success = (id: string, result: unknown): string =>
  JSON.stringify({ id, ok: true, result, _meta: { runtimeId: 'rt' } })

const streamEmit = (id: string, result: unknown): string =>
  JSON.stringify({ id, ok: true, result, _meta: { runtimeId: 'rt' }, streaming: true })

describe('RpcConnection', () => {
  let transport: FakeTransport
  let ids: string[]
  let connection: RpcConnection

  beforeEach(() => {
    vi.useFakeTimers()
    transport = createFakeTransport()
    ids = ['id-1', 'id-2', 'id-3']
    connection = new RpcConnection(transport, {
      deviceToken: 'tok',
      timeoutMs: 5000,
      generateId: () => ids.shift() ?? 'id-overflow'
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('sends an encoded request with the device token', async () => {
    const pending = connection.call('worktree.list', { repoId: 'r' })
    expect(JSON.parse(transport.sent[0] ?? '')).toEqual({
      id: 'id-1',
      deviceToken: 'tok',
      method: 'worktree.list',
      params: { repoId: 'r' }
    })
    transport.receive(success('id-1', []))
    await expect(pending).resolves.toMatchObject({ ok: true, result: [] })
  })

  it('correlates concurrent calls by response id', async () => {
    const first = connection.call('a')
    const second = connection.call('b')
    transport.receive(success('id-2', 'second-result'))
    transport.receive(success('id-1', 'first-result'))
    await expect(first).resolves.toMatchObject({ result: 'first-result' })
    await expect(second).resolves.toMatchObject({ result: 'second-result' })
  })

  it('rejects with RpcCallError on a failure envelope', async () => {
    const pending = connection.call('worktree.create')
    transport.receive(
      JSON.stringify({ id: 'id-1', ok: false, error: { code: 'repo_not_found', message: 'nope' } })
    )
    await expect(pending).rejects.toThrowError(RpcCallError)
    await expect(pending).rejects.toMatchObject({ code: 'repo_not_found' })
  })

  it('ignores keepalives and unknown response ids', async () => {
    const pending = connection.call('a')
    transport.receive(JSON.stringify({ _keepalive: true }))
    transport.receive(success('id-999', 'stray'))
    transport.receive(success('id-1', 'real'))
    await expect(pending).resolves.toMatchObject({ result: 'real' })
  })

  it('rejects when the timeout elapses without a response', async () => {
    const pending = connection.call('slow.method')
    const assertion = expect(pending).rejects.toMatchObject({ code: 'rpc_timeout' })
    await vi.advanceTimersByTimeAsync(5001)
    await assertion
  })

  it('rejects every pending call when the transport closes', async () => {
    const first = connection.call('a')
    const second = connection.call('b')
    transport.close('gone')
    await expect(first).rejects.toMatchObject({ code: 'connection_closed' })
    await expect(second).rejects.toMatchObject({ code: 'connection_closed' })
  })

  // CO-206 regression: today's handleFrame has no `kind === 'keepalive'` branch at all —
  // keepalives are silently dropped and pending timers never refresh.
  it('keepalive refreshes the pending call timeout', async () => {
    const pending = connection.call('slow.method')
    await vi.advanceTimersByTimeAsync(4999)
    transport.receive(JSON.stringify({ _keepalive: true }))
    await vi.advanceTimersByTimeAsync(4999)
    transport.receive(success('id-1', 'finally'))
    await expect(pending).resolves.toMatchObject({ result: 'finally' })
  })

  it('a keepalive refreshes every pending call timeout, not just the newest', async () => {
    const first = connection.call('a')
    const second = connection.call('b')
    await vi.advanceTimersByTimeAsync(4999)
    transport.receive(JSON.stringify({ _keepalive: true }))
    await vi.advanceTimersByTimeAsync(4999)
    transport.receive(success('id-1', 'first-result'))
    transport.receive(success('id-2', 'second-result'))
    await expect(first).resolves.toMatchObject({ result: 'first-result' })
    await expect(second).resolves.toMatchObject({ result: 'second-result' })
  })

  it('never sends authToken on the wire', async () => {
    connection.call('worktree.list')
    const parsed = JSON.parse(transport.sent[0] ?? '')
    expect(parsed.deviceToken).toBe('tok')
    expect(parsed.authToken).toBeUndefined()
  })

  describe('openStream', () => {
    it('delivers multiple emits on the same id without tearing down after the first', () => {
      const emits: unknown[] = []
      connection.openStream(
        'terminal.multiplex',
        {},
        {
          onEmit: (result) => emits.push(result),
          onError: () => {},
          onClose: () => {}
        }
      )
      expect(JSON.parse(transport.sent[0] ?? '')).toMatchObject({
        id: 'id-1',
        method: 'terminal.multiplex'
      })
      transport.receive(streamEmit('id-1', { type: 'ready' }))
      transport.receive(streamEmit('id-1', { type: 'subscribed', streamId: 1 }))
      transport.receive(streamEmit('id-1', { type: 'end', streamId: 1 }))
      expect(emits).toEqual([
        { type: 'ready' },
        { type: 'subscribed', streamId: 1 },
        { type: 'end', streamId: 1 }
      ])
    })

    it('does not resolve/consume pending calls or vice versa (separate maps)', async () => {
      const emits: unknown[] = []
      connection.openStream(
        'terminal.multiplex',
        {},
        {
          onEmit: (result) => emits.push(result),
          onError: () => {},
          onClose: () => {}
        }
      )
      const pending = connection.call('worktree.list')
      transport.receive(streamEmit('id-1', { type: 'ready' }))
      transport.receive(success('id-2', []))
      await expect(pending).resolves.toMatchObject({ result: [] })
      expect(emits).toEqual([{ type: 'ready' }])
    })

    it('routes a failure response for the stream id to onError, not call()', () => {
      const errors: unknown[] = []
      connection.openStream(
        'terminal.multiplex',
        {},
        {
          onEmit: () => {},
          onError: (err) => errors.push(err),
          onClose: () => {}
        }
      )
      transport.receive(
        JSON.stringify({ id: 'id-1', ok: false, error: { code: 'boom', message: 'nope' } })
      )
      expect(errors).toHaveLength(1)
      expect(errors[0]).toMatchObject({ code: 'boom' })
    })

    it('notifies onClose for every open stream when the transport closes', () => {
      const closed: boolean[] = []
      connection.openStream(
        'terminal.multiplex',
        {},
        {
          onEmit: () => {},
          onError: () => {},
          onClose: () => closed.push(true)
        }
      )
      transport.close('gone')
      expect(closed).toEqual([true])
    })

    it('is not subject to the request timeout', async () => {
      connection.openStream(
        'terminal.multiplex',
        {},
        {
          onEmit: () => {},
          onError: () => {},
          onClose: () => {
            throw new Error('stream should not be torn down by the call timeout')
          }
        }
      )
      await vi.advanceTimersByTimeAsync(5001)
    })

    it('routes binary frames to the stream consumer via onBinary passthrough', () => {
      const received: Uint8Array[] = []
      connection.onBinary?.((bytes) => received.push(bytes))
      const bytes = new Uint8Array([1, 2, 3])
      transport.receiveBinary(bytes)
      expect(received).toEqual([bytes])
    })

    it('sendBinary passes through to the transport', () => {
      const bytes = new Uint8Array([9, 8, 7])
      connection.sendBinary?.(bytes)
      expect(transport.sentBinary).toEqual([bytes])
    })

    it('a keepalive does not touch stream state (no timers to refresh)', () => {
      const emits: unknown[] = []
      connection.openStream(
        'terminal.multiplex',
        {},
        {
          onEmit: (result) => emits.push(result),
          onError: () => {},
          onClose: () => {}
        }
      )
      transport.receive(JSON.stringify({ _keepalive: true }))
      transport.receive(streamEmit('id-1', { type: 'ready' }))
      expect(emits).toEqual([{ type: 'ready' }])
    })
  })
})
