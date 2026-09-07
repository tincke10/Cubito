import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSystemGraphSource } from './system-graph-source'
import { createSceneStore } from './scene-store'
import type { SceneStore } from './scene-store'
import { SYSTEM_SNAPSHOT_POLL_INTERVAL_MS } from './system-snapshot-poll'
import type { SystemSnapshotPollGatewayPort } from './system-snapshot-poll'
import { RpcCallError } from '../infrastructure/rpc/rpc-connection'
import type { SystemGraphSnapshot } from './ports/runtime-gateway'
import type {
  SystemGraphStreamFrame,
  SystemGraphStreamHandlers,
  SystemGraphStreamPort
} from './ports/system-graph-stream-port'

const snapshotA: SystemGraphSnapshot = {
  nodes: [{ id: 'router', kind: 'router', label: 'router', diff: null }],
  edges: []
}

type FakeGateway = SystemSnapshotPollGatewayPort & {
  calls: number
  systemSnapshotImpl?: () => Promise<SystemGraphSnapshot>
}

function createFakeGateway(): FakeGateway {
  const gw: FakeGateway = {
    calls: 0,
    systemSnapshot: async () => {
      gw.calls += 1
      if (gw.systemSnapshotImpl) return gw.systemSnapshotImpl()
      return snapshotA
    },
    gitBranchCompare: async () => ({
      changedFiles: 0,
      commitsAhead: 0,
      commitsBehind: 0,
      baseRef: '',
      headOid: '',
      mergeBase: '',
      status: '',
      entries: []
    })
  }
  return gw
}

type FakeSubscription = {
  worktree: string
  handlers: SystemGraphStreamHandlers
  closeSpy: ReturnType<typeof vi.fn>
}

function createFakeStreamPort(): {
  port: SystemGraphStreamPort
  subscriptions: FakeSubscription[]
} {
  const subscriptions: FakeSubscription[] = []
  const port: SystemGraphStreamPort = {
    watch: vi.fn((worktree: string, handlers: SystemGraphStreamHandlers) => {
      const closeSpy = vi.fn()
      subscriptions.push({ worktree, handlers, closeSpy })
      return { close: closeSpy }
    })
  }
  return { port, subscriptions }
}

const readyFrame = (snapshot: SystemGraphSnapshot = snapshotA): SystemGraphStreamFrame => ({
  type: 'ready',
  subscriptionId: 'sub-1',
  snapshot
})

const graphFrame = (snapshot: SystemGraphSnapshot = snapshotA): SystemGraphStreamFrame => ({
  type: 'graph',
  snapshot
})

function graphOf(store: SceneStore) {
  const slice = store.get().systemView
  if (slice.view !== 'open') throw new Error('expected systemView to be open')
  return slice.graph
}

describe('createSystemGraphSource', () => {
  let store: SceneStore
  let onDemoFallback: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.useFakeTimers()
    store = createSceneStore()
    store.dispatchSystemView({ type: 'open', nodeId: '/wt/alpha' })
    onDemoFallback = vi.fn()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('start opens the stream, ready publishes, poll never starts', async () => {
    const gateway = createFakeGateway()
    const { port, subscriptions } = createFakeStreamPort()
    const source = createSystemGraphSource({ store, gateway, streamPort: port, onDemoFallback })

    source.start('/wt/alpha')
    expect(subscriptions).toHaveLength(1)
    expect(subscriptions[0]!.worktree).toBe('/wt/alpha')

    subscriptions[0]!.handlers.onFrame(readyFrame())
    await vi.advanceTimersByTimeAsync(0)

    expect(graphOf(store).nodes.get('router')?.label).toBe('router')
    expect(gateway.calls).toBe(0)
    expect(source.currentSource()).toBe('stream')
    source.stop()
  })

  it('graph frames publish with no gateway.systemSnapshot call', async () => {
    const gateway = createFakeGateway()
    const { port, subscriptions } = createFakeStreamPort()
    const source = createSystemGraphSource({ store, gateway, streamPort: port, onDemoFallback })

    source.start('/wt/alpha')
    subscriptions[0]!.handlers.onFrame(readyFrame())
    subscriptions[0]!.handlers.onFrame(graphFrame())
    await vi.advanceTimersByTimeAsync(0)

    expect(gateway.calls).toBe(0)
    source.stop()
  })

  it('method_not_found closes the subscription and starts the poll', async () => {
    const gateway = createFakeGateway()
    const { port, subscriptions } = createFakeStreamPort()
    const source = createSystemGraphSource({ store, gateway, streamPort: port, onDemoFallback })

    source.start('/wt/alpha')
    subscriptions[0]!.handlers.onUnsupported()
    await vi.advanceTimersByTimeAsync(0)

    expect(subscriptions[0]!.closeSpy).toHaveBeenCalledTimes(1)
    expect(gateway.calls).toBe(1)
    expect(source.currentSource()).toBe('poll')
    source.stop()
  })

  it('a stream error after ready falls back to the poll, with no re-subscribe', async () => {
    const gateway = createFakeGateway()
    const { port, subscriptions } = createFakeStreamPort()
    const source = createSystemGraphSource({ store, gateway, streamPort: port, onDemoFallback })

    source.start('/wt/alpha')
    subscriptions[0]!.handlers.onFrame(readyFrame())
    subscriptions[0]!.handlers.onClosed()
    await vi.advanceTimersByTimeAsync(0)

    expect(subscriptions).toHaveLength(1) // no re-subscribe attempt
    expect(gateway.calls).toBe(1)
    expect(source.currentSource()).toBe('poll')
    source.stop()
  })

  it('an end frame notification (onClosed) after ready falls back to the poll', async () => {
    const gateway = createFakeGateway()
    const { port, subscriptions } = createFakeStreamPort()
    const source = createSystemGraphSource({ store, gateway, streamPort: port, onDemoFallback })

    source.start('/wt/alpha')
    subscriptions[0]!.handlers.onFrame(readyFrame())
    subscriptions[0]!.handlers.onClosed()
    await vi.advanceTimersByTimeAsync(0)

    expect(gateway.calls).toBe(1)
    source.stop()
  })

  it('poll onUnsupported calls onDemoFallback', async () => {
    const gateway = createFakeGateway()
    gateway.systemSnapshotImpl = async () => {
      throw new RpcCallError('method_not_found', "Unknown method 'system.snapshot'.")
    }
    const source = createSystemGraphSource({ store, gateway, onDemoFallback })

    source.start('/wt/alpha')
    await vi.advanceTimersByTimeAsync(0)

    expect(onDemoFallback).toHaveBeenCalledTimes(1)
    expect(source.currentSource()).toBe('demo')
    source.stop()
  })

  it('stop() sends system.unwatch (closes the subscription) and stops the poll + publisher', async () => {
    const gateway = createFakeGateway()
    const { port, subscriptions } = createFakeStreamPort()
    const source = createSystemGraphSource({ store, gateway, streamPort: port, onDemoFallback })

    source.start('/wt/alpha')
    subscriptions[0]!.handlers.onFrame(readyFrame())
    source.stop()

    expect(subscriptions[0]!.closeSpy).toHaveBeenCalledTimes(1)

    // stopping the poll too: a fresh poll-only source never ticks after stop()
    const pollSource = createSystemGraphSource({ store, gateway, onDemoFallback })
    pollSource.start('/wt/alpha')
    await vi.advanceTimersByTimeAsync(0)
    const callsBeforeStop = gateway.calls
    pollSource.stop()
    await vi.advanceTimersByTimeAsync(SYSTEM_SNAPSHOT_POLL_INTERVAL_MS * 3)
    expect(gateway.calls).toBe(callsBeforeStop)
  })

  it('worktree switch closes the old subscription and opens a new one', () => {
    const gateway = createFakeGateway()
    const { port, subscriptions } = createFakeStreamPort()
    const source = createSystemGraphSource({ store, gateway, streamPort: port, onDemoFallback })

    source.start('/wt/alpha')
    source.start('/wt/beta')

    expect(subscriptions).toHaveLength(2)
    expect(subscriptions[0]!.closeSpy).toHaveBeenCalledTimes(1)
    expect(subscriptions[1]!.worktree).toBe('/wt/beta')
    source.stop()
  })

  it('worktree switch dispatches open for the new node (resets focusedNodeId/graph/feed)', () => {
    const gateway = createFakeGateway()
    const { port, subscriptions } = createFakeStreamPort()
    const source = createSystemGraphSource({ store, gateway, streamPort: port, onDemoFallback })

    source.start('/wt/alpha')
    subscriptions[0]!.handlers.onFrame(readyFrame())
    source.start('/wt/beta')

    const slice = store.get().systemView
    expect(slice.view).toBe('open')
    if (slice.view === 'open') expect(slice.focusedNodeId).toBe('/wt/beta')
    source.stop()
  })

  it('rebind mid-open drops the live stream and re-opens on the new port', () => {
    const gateway = createFakeGateway()
    const portA = createFakeStreamPort()
    const portB = createFakeStreamPort()
    const source = createSystemGraphSource({
      store,
      gateway,
      streamPort: portA.port,
      onDemoFallback
    })

    source.start('/wt/alpha')
    source.rebind(gateway, portB.port)

    expect(portA.subscriptions[0]!.closeSpy).toHaveBeenCalledTimes(1)
    expect(portB.subscriptions).toHaveLength(1)
    expect(portB.subscriptions[0]!.worktree).toBe('/wt/alpha')
    source.stop()
  })

  it('no stream port bound goes straight to the poll', async () => {
    const gateway = createFakeGateway()
    const source = createSystemGraphSource({ store, gateway, onDemoFallback })

    source.start('/wt/alpha')
    await vi.advanceTimersByTimeAsync(0)

    expect(gateway.calls).toBe(1)
    expect(source.currentSource()).toBe('poll')
    source.stop()
  })

  it('currentSource() reports stream, poll and demo across a fallback chain', async () => {
    const gateway = createFakeGateway()
    const { port, subscriptions } = createFakeStreamPort()
    const source = createSystemGraphSource({ store, gateway, streamPort: port, onDemoFallback })

    source.start('/wt/alpha')
    expect(source.currentSource()).toBe('stream')

    gateway.systemSnapshotImpl = async () => {
      throw new RpcCallError('method_not_found', "Unknown method 'system.snapshot'.")
    }
    subscriptions[0]!.handlers.onUnsupported()
    await vi.advanceTimersByTimeAsync(0)

    expect(source.currentSource()).toBe('demo')
    source.stop()
  })

  it('a graph frame after stop() publishes nothing', async () => {
    const gateway = createFakeGateway()
    const { port, subscriptions } = createFakeStreamPort()
    const source = createSystemGraphSource({ store, gateway, streamPort: port, onDemoFallback })

    source.start('/wt/alpha')
    subscriptions[0]!.handlers.onFrame(readyFrame())
    source.stop()
    subscriptions[0]!.handlers.onFrame(graphFrame({ nodes: [], edges: [] }))
    await vi.advanceTimersByTimeAsync(0)

    expect(graphOf(store).nodes.get('router')?.label).toBe('router') // unchanged
  })
})
