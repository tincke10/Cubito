import { describe, expect, it, vi } from 'vitest'
import { createSystemGraphStreamPort } from './orcad-system-watch-gateway'
import type { SystemWatchConnection } from './orcad-system-watch-gateway'
import { RpcCallError } from './rpc-connection'
import type { StreamHandlers } from './rpc-connection'
import type { SystemGraphStreamHandlers } from '../../application/ports/system-graph-stream-port'

function createFakeConnection() {
  let captured: StreamHandlers | null = null
  const streamClose = vi.fn()
  const call = vi.fn(async () => ({
    id: 'x',
    ok: true as const,
    result: { unwatched: true },
    _meta: { runtimeId: 'rt' }
  }))
  const openStream = vi.fn((_method: string, _params: unknown, handlers: StreamHandlers) => {
    captured = handlers
    return { close: streamClose }
  })
  const connection: SystemWatchConnection = { openStream, call }
  return {
    connection,
    openStream,
    call,
    streamClose,
    emit: (result: unknown) => captured?.onEmit(result),
    fail: (error: RpcCallError) => captured?.onError(error),
    closeTransport: () => captured?.onClose()
  }
}

type FakeHandlers = SystemGraphStreamHandlers & {
  onFrame: ReturnType<typeof vi.fn>
  onUnsupported: ReturnType<typeof vi.fn>
  onClosed: ReturnType<typeof vi.fn>
}

function createHandlers(): FakeHandlers {
  return {
    onFrame: vi.fn(),
    onUnsupported: vi.fn(),
    onClosed: vi.fn()
  }
}

const readyFrame = (subscriptionId = 'sub-1') => ({
  type: 'ready',
  subscriptionId,
  graph: { nodes: [{ id: 'router', kind: 'router', label: 'router' }], edges: [] }
})

const graphFrame = () => ({ type: 'graph', graph: { nodes: [], edges: [] } })

describe('createSystemGraphStreamPort', () => {
  it('opens system.watch with {worktree}', () => {
    const fake = createFakeConnection()
    createSystemGraphStreamPort(fake.connection).watch('/wt/alpha', createHandlers())

    expect(fake.openStream).toHaveBeenCalledWith(
      'system.watch',
      { worktree: '/wt/alpha' },
      expect.anything()
    )
  })

  it('ready -> onFrame ready with subscriptionId and the mapped snapshot', () => {
    const fake = createFakeConnection()
    const handlers = createHandlers()
    createSystemGraphStreamPort(fake.connection).watch('/wt/alpha', handlers)

    fake.emit(readyFrame('sub-1'))

    expect(handlers.onFrame).toHaveBeenCalledWith({
      type: 'ready',
      subscriptionId: 'sub-1',
      snapshot: {
        nodes: [{ id: 'router', kind: 'router', label: 'router', diff: null }],
        edges: []
      }
    })
  })

  it('graph -> onFrame graph with the mapped snapshot', () => {
    const fake = createFakeConnection()
    const handlers = createHandlers()
    createSystemGraphStreamPort(fake.connection).watch('/wt/alpha', handlers)
    fake.emit(readyFrame())

    fake.emit(graphFrame())

    expect(handlers.onFrame).toHaveBeenLastCalledWith({
      type: 'graph',
      snapshot: { nodes: [], edges: [] }
    })
  })

  it('a starting frame is ignored', () => {
    const fake = createFakeConnection()
    const handlers = createHandlers()
    createSystemGraphStreamPort(fake.connection).watch('/wt/alpha', handlers)

    fake.emit({ type: 'starting', subscriptionId: 'sub-1' })

    expect(handlers.onFrame).not.toHaveBeenCalled()
    expect(handlers.onClosed).not.toHaveBeenCalled()
  })

  it('an unrecognized future frame type is ignored', () => {
    const fake = createFakeConnection()
    const handlers = createHandlers()
    createSystemGraphStreamPort(fake.connection).watch('/wt/alpha', handlers)

    fake.emit({ type: 'future-frame' })

    expect(handlers.onFrame).not.toHaveBeenCalled()
    expect(handlers.onClosed).not.toHaveBeenCalled()
  })

  it('an error frame -> onClosed, and closes the transport stream', () => {
    const fake = createFakeConnection()
    const handlers = createHandlers()
    createSystemGraphStreamPort(fake.connection).watch('/wt/alpha', handlers)

    fake.emit({ type: 'error', message: 'boom' })

    expect(handlers.onClosed).toHaveBeenCalledTimes(1)
    expect(fake.streamClose).toHaveBeenCalledTimes(1)
  })

  it('an end frame -> onClosed, and closes the transport stream', () => {
    const fake = createFakeConnection()
    const handlers = createHandlers()
    createSystemGraphStreamPort(fake.connection).watch('/wt/alpha', handlers)

    fake.emit({ type: 'end' })

    expect(handlers.onClosed).toHaveBeenCalledTimes(1)
    expect(fake.streamClose).toHaveBeenCalledTimes(1)
  })

  it('an rpc failure with method_not_found -> onUnsupported (not onClosed), and closes the stream', () => {
    const fake = createFakeConnection()
    const handlers = createHandlers()
    createSystemGraphStreamPort(fake.connection).watch('/wt/alpha', handlers)

    fake.fail(new RpcCallError('method_not_found', "Unknown method 'system.watch'."))

    expect(handlers.onUnsupported).toHaveBeenCalledTimes(1)
    expect(handlers.onClosed).not.toHaveBeenCalled()
    expect(fake.streamClose).toHaveBeenCalledTimes(1)
  })

  it('any other rpc failure -> onClosed, and closes the stream', () => {
    const fake = createFakeConnection()
    const handlers = createHandlers()
    createSystemGraphStreamPort(fake.connection).watch('/wt/alpha', handlers)

    fake.fail(new RpcCallError('internal_error', 'boom'))

    expect(handlers.onClosed).toHaveBeenCalledTimes(1)
    expect(fake.streamClose).toHaveBeenCalledTimes(1)
  })

  it('a transport close -> onClosed, and closes the stream', () => {
    const fake = createFakeConnection()
    const handlers = createHandlers()
    createSystemGraphStreamPort(fake.connection).watch('/wt/alpha', handlers)

    fake.closeTransport()

    expect(handlers.onClosed).toHaveBeenCalledTimes(1)
    expect(fake.streamClose).toHaveBeenCalledTimes(1)
  })

  it('close() after ready sends system.unwatch with the ready subscriptionId, then closes', () => {
    const fake = createFakeConnection()
    const handlers = createHandlers()
    const subscription = createSystemGraphStreamPort(fake.connection).watch('/wt/alpha', handlers)
    fake.emit(readyFrame('sub-42'))

    subscription.close()

    expect(fake.call).toHaveBeenCalledWith('system.unwatch', { subscriptionId: 'sub-42' })
    expect(fake.streamClose).toHaveBeenCalledTimes(1)
  })

  it('close() before ready sends no unwatch, but still closes the transport stream', () => {
    const fake = createFakeConnection()
    const handlers = createHandlers()
    const subscription = createSystemGraphStreamPort(fake.connection).watch('/wt/alpha', handlers)

    subscription.close()

    expect(fake.call).not.toHaveBeenCalled()
    expect(fake.streamClose).toHaveBeenCalledTimes(1)
  })

  it('every terminal path notifies exactly once and drops any later frame', () => {
    const fake = createFakeConnection()
    const handlers = createHandlers()
    createSystemGraphStreamPort(fake.connection).watch('/wt/alpha', handlers)

    fake.emit({ type: 'error', message: 'first' })
    fake.emit({ type: 'error', message: 'second' })
    fake.emit(graphFrame())
    fake.closeTransport()

    expect(handlers.onClosed).toHaveBeenCalledTimes(1)
    expect(handlers.onFrame).not.toHaveBeenCalled()
  })
})
