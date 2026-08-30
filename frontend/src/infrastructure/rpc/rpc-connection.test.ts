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
      authToken: 'tok',
      timeoutMs: 5000,
      generateId: () => ids.shift() ?? 'id-overflow'
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('sends an encoded request with the auth token', async () => {
    const pending = connection.call('worktree.list', { repoId: 'r' })
    expect(JSON.parse(transport.sent[0] ?? '')).toEqual({
      id: 'id-1',
      authToken: 'tok',
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
})
