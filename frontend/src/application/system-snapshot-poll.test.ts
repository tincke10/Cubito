import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSystemSnapshotPoll, SYSTEM_SNAPSHOT_POLL_INTERVAL_MS } from './system-snapshot-poll'
import type { SystemSnapshotPollGatewayPort } from './system-snapshot-poll'
import type { SystemGraphPublisher } from './system-graph-publish'
import { createSceneStore } from './scene-store'
import type { SceneStore } from './scene-store'
import { RpcCallError } from '../infrastructure/rpc/rpc-connection'
import type { BranchCompare, SystemGraphSnapshot } from './ports/runtime-gateway'

type Deferred<T> = { promise: Promise<T>; resolve: (v: T) => void; reject: (e: unknown) => void }

function deferred<T>(): Deferred<T> {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const snapshotA: SystemGraphSnapshot = {
  nodes: [{ id: 'router', kind: 'router', label: 'router', diff: null }],
  edges: []
}

const notReadyCompare: BranchCompare = {
  changedFiles: 0,
  commitsAhead: 0,
  commitsBehind: 0,
  baseRef: '',
  headOid: '',
  mergeBase: '',
  status: '',
  entries: []
}

type FakeGateway = SystemSnapshotPollGatewayPort & {
  calls: number
  systemSnapshotImpl?: () => Promise<SystemGraphSnapshot>
}

/** Fake gateway: `systemSnapshot` resolution timing/payload is test-controlled. `gitBranchCompare`
 *  is never resolvable — the join itself is covered by system-graph-publish.test.ts now; these
 *  tests only exercise the poll's own scheduling and its wiring to the (real or fake) publisher. */
function createFakeGateway(snapshot: SystemGraphSnapshot = snapshotA): FakeGateway {
  const gw: FakeGateway = {
    calls: 0,
    systemSnapshot: async () => {
      gw.calls += 1
      if (gw.systemSnapshotImpl) return gw.systemSnapshotImpl()
      return snapshot
    },
    gitBranchCompare: async () => notReadyCompare
  }
  return gw
}

function createFakePublisher(): SystemGraphPublisher & {
  publishCalls: Array<{ worktree: string; snapshot: SystemGraphSnapshot }>
} {
  const publisher = {
    publishCalls: [] as Array<{ worktree: string; snapshot: SystemGraphSnapshot }>,
    publish: vi.fn((worktree: string, snapshot: SystemGraphSnapshot) => {
      publisher.publishCalls.push({ worktree, snapshot })
    }),
    stop: vi.fn(),
    rebindGateway: vi.fn()
  }
  return publisher
}

describe('createSystemSnapshotPoll', () => {
  let store: SceneStore
  let setTimerSpy: ReturnType<typeof vi.fn>
  let clearTimerSpy: ReturnType<typeof vi.fn>
  let onUnsupported: ReturnType<typeof vi.fn>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let setIntervalSpy: any

  beforeEach(() => {
    vi.useFakeTimers()
    store = createSceneStore()
    setTimerSpy = vi.fn((fn: () => void, ms: number) => setTimeout(fn, ms))
    clearTimerSpy = vi.fn((handle: unknown) =>
      clearTimeout(handle as ReturnType<typeof setTimeout>)
    )
    onUnsupported = vi.fn()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setIntervalSpy = vi.spyOn(globalThis as any, 'setInterval')
  })

  afterEach(() => {
    vi.useRealTimers()
    setIntervalSpy.mockRestore()
  })

  it('start() dispatches open then replaces the graph from the mapped snapshot, polling on cadence', async () => {
    const gateway = createFakeGateway()
    const poll = createSystemSnapshotPoll({
      store,
      gateway,
      onUnsupported,
      setTimer: setTimerSpy,
      clearTimer: clearTimerSpy
    })
    poll.start('/wt/alpha')
    const slice = store.get().systemView
    expect(slice.view).toBe('open')
    if (slice.view === 'open') expect(slice.focusedNodeId).toBe('/wt/alpha')

    await vi.advanceTimersByTimeAsync(0)
    expect(gateway.calls).toBe(1)
    const afterFirst = store.get().systemView
    expect(afterFirst.view).toBe('open')
    if (afterFirst.view === 'open') {
      expect(afterFirst.graph.nodes.get('router')?.label).toBe('router')
    }

    await vi.advanceTimersByTimeAsync(SYSTEM_SNAPSHOT_POLL_INTERVAL_MS)
    expect(gateway.calls).toBe(2)
    poll.stop()
  })

  it('on method_not_found: stops and calls onUnsupported exactly once, no further polling', async () => {
    const gateway = createFakeGateway()
    gateway.systemSnapshotImpl = async () => {
      throw new RpcCallError('method_not_found', "Unknown method 'system.snapshot'.")
    }
    const poll = createSystemSnapshotPoll({
      store,
      gateway,
      onUnsupported,
      setTimer: setTimerSpy,
      clearTimer: clearTimerSpy
    })
    poll.start('/wt/alpha')
    await vi.advanceTimersByTimeAsync(0)
    expect(gateway.calls).toBe(1)
    expect(onUnsupported).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(SYSTEM_SNAPSHOT_POLL_INTERVAL_MS * 3)
    expect(gateway.calls).toBe(1) // no retry after unsupported
    expect(onUnsupported).toHaveBeenCalledTimes(1)
  })

  it('on a transient (non method_not_found) error: keeps the last graph and retries on cadence', async () => {
    const gateway = createFakeGateway()
    gateway.systemSnapshotImpl = async () => {
      throw new Error('network blip')
    }
    const poll = createSystemSnapshotPoll({
      store,
      gateway,
      onUnsupported,
      setTimer: setTimerSpy,
      clearTimer: clearTimerSpy
    })
    poll.start('/wt/alpha')
    await vi.advanceTimersByTimeAsync(0)
    expect(gateway.calls).toBe(1)
    expect(onUnsupported).not.toHaveBeenCalled()
    const slice = store.get().systemView
    expect(slice.view).toBe('open') // graph kept (still empty, but view intact — not torn down)

    await vi.advanceTimersByTimeAsync(SYSTEM_SNAPSHOT_POLL_INTERVAL_MS)
    expect(gateway.calls).toBe(2) // retried
    poll.stop()
  })

  it('self-halts scheduling once systemView leaves open mid-flight: no dispatch, no next timer', async () => {
    const gate = deferred<SystemGraphSnapshot>()
    const gateway = createFakeGateway()
    gateway.systemSnapshotImpl = () => gate.promise
    const poll = createSystemSnapshotPoll({
      store,
      gateway,
      onUnsupported,
      setTimer: setTimerSpy,
      clearTimer: clearTimerSpy
    })
    poll.start('/wt/alpha')
    await vi.advanceTimersByTimeAsync(0)
    expect(gateway.calls).toBe(1)
    const callsBeforeClose = setTimerSpy.mock.calls.length

    store.dispatchSystemView({ type: 'close' })
    gate.resolve(snapshotA)
    await vi.advanceTimersByTimeAsync(0)

    expect(store.get().systemView).toEqual({ view: 'closed' })
    expect(setTimerSpy.mock.calls.length).toBe(callsBeforeClose)

    await vi.advanceTimersByTimeAsync(SYSTEM_SNAPSHOT_POLL_INTERVAL_MS * 5)
    expect(gateway.calls).toBe(1)
  })

  it('stop() clears the pending timer and prevents any further gateway call or dispatch', async () => {
    const gateway = createFakeGateway()
    const poll = createSystemSnapshotPoll({
      store,
      gateway,
      onUnsupported,
      setTimer: setTimerSpy,
      clearTimer: clearTimerSpy
    })
    poll.start('/wt/alpha')
    await vi.advanceTimersByTimeAsync(0)
    expect(gateway.calls).toBe(1)

    poll.stop()
    expect(clearTimerSpy).toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(SYSTEM_SNAPSHOT_POLL_INTERVAL_MS * 5)
    expect(gateway.calls).toBe(1)
  })

  it('rebindGateway swaps the gateway used by the next tick, not the in-flight one', async () => {
    const gatewayA = createFakeGateway()
    const gatewayB = createFakeGateway()
    const poll = createSystemSnapshotPoll({
      store,
      gateway: gatewayA,
      onUnsupported,
      setTimer: setTimerSpy,
      clearTimer: clearTimerSpy
    })
    poll.start('/wt/alpha')
    await vi.advanceTimersByTimeAsync(0)
    expect(gatewayA.calls).toBe(1)
    expect(gatewayB.calls).toBe(0)

    poll.rebindGateway(gatewayB)
    await vi.advanceTimersByTimeAsync(SYSTEM_SNAPSHOT_POLL_INTERVAL_MS)
    expect(gatewayA.calls).toBe(1)
    expect(gatewayB.calls).toBe(1)
    poll.stop()
  })

  it('never uses setInterval — only chained setTimeout', async () => {
    const gateway = createFakeGateway()
    const poll = createSystemSnapshotPoll({ store, gateway, onUnsupported })
    poll.start('/wt/alpha')
    await vi.advanceTimersByTimeAsync(SYSTEM_SNAPSHOT_POLL_INTERVAL_MS * 5)
    expect(setIntervalSpy).not.toHaveBeenCalled()
    poll.stop()
  })

  describe('publisher wiring (Wave F1 extraction)', () => {
    it('each tick calls publisher.publish with the worktree and the raw gateway snapshot', async () => {
      const gateway = createFakeGateway(snapshotA)
      const publisher = createFakePublisher()
      const poll = createSystemSnapshotPoll({
        store,
        gateway,
        onUnsupported,
        setTimer: setTimerSpy,
        clearTimer: clearTimerSpy,
        publisher
      })

      poll.start('/wt/alpha')
      await vi.advanceTimersByTimeAsync(0)

      expect(publisher.publishCalls).toEqual([{ worktree: '/wt/alpha', snapshot: snapshotA }])
      poll.stop()
    })

    it('no publish call while systemSnapshot fails or is unsupported', async () => {
      const gateway = createFakeGateway()
      gateway.systemSnapshotImpl = async () => {
        throw new RpcCallError('method_not_found', "Unknown method 'system.snapshot'.")
      }
      const publisher = createFakePublisher()
      const poll = createSystemSnapshotPoll({
        store,
        gateway,
        onUnsupported,
        setTimer: setTimerSpy,
        clearTimer: clearTimerSpy,
        publisher
      })

      poll.start('/wt/alpha')
      await vi.advanceTimersByTimeAsync(0)

      expect(publisher.publish).not.toHaveBeenCalled()
    })

    it('stop() stops the injected publisher', async () => {
      const gateway = createFakeGateway()
      const publisher = createFakePublisher()
      const poll = createSystemSnapshotPoll({
        store,
        gateway,
        onUnsupported,
        setTimer: setTimerSpy,
        clearTimer: clearTimerSpy,
        publisher
      })

      poll.start('/wt/alpha')
      await vi.advanceTimersByTimeAsync(0)
      poll.stop()

      expect(publisher.stop).toHaveBeenCalledTimes(1)
    })

    it('rebindGateway forwards to the injected publisher, not just the snapshot gateway', async () => {
      const gatewayA = createFakeGateway()
      const gatewayB = createFakeGateway()
      const publisher = createFakePublisher()
      const poll = createSystemSnapshotPoll({
        store,
        gateway: gatewayA,
        onUnsupported,
        setTimer: setTimerSpy,
        clearTimer: clearTimerSpy,
        publisher
      })

      poll.start('/wt/alpha')
      await vi.advanceTimersByTimeAsync(0)
      poll.rebindGateway(gatewayB)

      expect(publisher.rebindGateway).toHaveBeenCalledWith(gatewayB)
      poll.stop()
    })
  })
})
