import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RpcCallError, RpcConnection } from './rpc-connection'
import type { RpcTransport } from './rpc-connection'

type FakeTransport = RpcTransport & {
  sent: string[]
  receive(raw: string): void
  close(reason?: string): void
}

const createFakeTransport = (): FakeTransport => {
  const messageHandlers: ((data: string) => void)[] = []
  const closeHandlers: ((reason?: string) => void)[] = []
  return {
    sent: [],
    send(data) {
      this.sent.push(data)
    },
    onMessage(cb) {
      messageHandlers.push(cb)
      return () => void messageHandlers.splice(messageHandlers.indexOf(cb), 1)
    },
    onClose(cb) {
      closeHandlers.push(cb)
      return () => void closeHandlers.splice(closeHandlers.indexOf(cb), 1)
    },
    receive(raw) {
      for (const cb of [...messageHandlers]) cb(raw)
    },
    close(reason) {
      for (const cb of [...closeHandlers]) cb(reason)
    }
  }
}

const success = (id: string, result: unknown): string =>
  JSON.stringify({ id, ok: true, result, _meta: { runtimeId: 'rt' } })

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
})
