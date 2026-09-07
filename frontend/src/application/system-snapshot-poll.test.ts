import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSystemSnapshotPoll, SYSTEM_SNAPSHOT_POLL_INTERVAL_MS } from './system-snapshot-poll'
import type { SystemSnapshotPollGatewayPort } from './system-snapshot-poll'
import { createSceneStore } from './scene-store'
import type { SceneStore } from './scene-store'
import { RpcCallError } from '../infrastructure/rpc/rpc-connection'
import type { BranchCompare, SystemGraphSnapshot } from './ports/runtime-gateway'
import { emptyWorktreeGraph } from '../domain/worktree-graph/types'
import type { WorktreeGraph, WorktreeNode } from '../domain/worktree-graph/types'
import { inertActivity } from '../domain/worktree-graph/node-activity'

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

/** Realistic engine ids (Wave 2 headline fixture): one router, two sibling endpoints. */
const realisticSnapshot: SystemGraphSnapshot = {
  nodes: [
    { id: 'router:src/routes/users.ts', kind: 'router', label: 'src/routes/users.ts', diff: null },
    {
      id: 'endpoint:src/routes/users.ts#0',
      kind: 'endpoint',
      label: 'GET /users',
      method: 'GET',
      path: '/users',
      diff: null
    },
    {
      id: 'endpoint:src/routes/users.ts#1',
      kind: 'endpoint',
      label: 'POST /users',
      method: 'POST',
      path: '/users',
      diff: null
    }
  ],
  edges: [
    { from: 'router:src/routes/users.ts', to: 'endpoint:src/routes/users.ts#0', kind: 'normal' },
    { from: 'router:src/routes/users.ts', to: 'endpoint:src/routes/users.ts#1', kind: 'normal' }
  ]
}

const readyCompare = (overrides: Partial<BranchCompare> = {}): BranchCompare => ({
  changedFiles: 1,
  commitsAhead: 1,
  commitsBehind: 0,
  baseRef: 'refs/heads/main',
  headOid: 'head-oid',
  mergeBase: 'merge-base',
  status: 'ready',
  entries: [{ path: 'src/routes/users.ts', status: 'modified', added: 34, removed: 8 }],
  ...overrides
})

const worktreeNode = (overrides: Partial<WorktreeNode> = {}): WorktreeNode => ({
  id: '/wt/alpha',
  repoId: 'repo',
  branch: 'refs/heads/feature',
  path: '/wt/alpha',
  status: 'in-progress',
  isMain: false,
  kind: 'worktree',
  parentId: null,
  childIds: [],
  activity: inertActivity(),
  baseRef: 'refs/heads/main',
  ...overrides
})

/** A worktree graph where '/wt/alpha' resolves a baseRef directly — lets the diff cache reach gitBranchCompare. */
function graphWithResolvableBaseRef(): WorktreeGraph {
  const graph = emptyWorktreeGraph()
  const node = worktreeNode()
  return { ...graph, nodes: new Map([[node.id, node]]) }
}

type FakeGateway = SystemSnapshotPollGatewayPort & {
  calls: number
  systemSnapshotImpl?: () => Promise<SystemGraphSnapshot>
  compareCalls: number
  gitBranchCompareImpl?: (worktree: string, baseRef: string) => Promise<BranchCompare>
}

/** Fake gateway: `systemSnapshot`/`gitBranchCompare` resolution timing and payload are test-controlled.
 *  `gitBranchCompare` defaults to a non-'ready' status — mirrors main.ts's demo gateway, so a test
 *  that never sets up a resolvable worktree graph (most of the pre-existing ones) sees no diff join. */
function createFakeGateway(snapshot: SystemGraphSnapshot = snapshotA): FakeGateway {
  const gw: FakeGateway = {
    calls: 0,
    compareCalls: 0,
    systemSnapshot: async () => {
      gw.calls += 1
      if (gw.systemSnapshotImpl) return gw.systemSnapshotImpl()
      return snapshot
    },
    gitBranchCompare: async (worktree, baseRef) => {
      gw.compareCalls += 1
      if (gw.gitBranchCompareImpl) return gw.gitBranchCompareImpl(worktree, baseRef)
      return readyCompare({ status: 'invalid-base', entries: [] })
    }
  }
  return gw
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

  describe('file-level diff join (Piece A)', () => {
    it('first tick renders idle/null even though it kicks a background diff fetch', async () => {
      store.update({ graph: graphWithResolvableBaseRef() })
      const gateway = createFakeGateway(realisticSnapshot)
      gateway.gitBranchCompareImpl = async () => readyCompare()
      const poll = createSystemSnapshotPoll({
        store,
        gateway,
        onUnsupported,
        setTimer: setTimerSpy,
        clearTimer: clearTimerSpy
      })

      poll.start('/wt/alpha')
      await vi.advanceTimersByTimeAsync(0)

      const slice = store.get().systemView
      expect(slice.view).toBe('open')
      if (slice.view === 'open') {
        expect(slice.graph.nodes.get('router:src/routes/users.ts')).toMatchObject({
          state: 'idle',
          diff: null
        })
      }
      poll.stop()
    })

    it('a later tick carries real diff numbers once the background fetch has resolved', async () => {
      store.update({ graph: graphWithResolvableBaseRef() })
      const gateway = createFakeGateway(realisticSnapshot)
      gateway.gitBranchCompareImpl = async () => readyCompare()
      const poll = createSystemSnapshotPoll({
        store,
        gateway,
        onUnsupported,
        setTimer: setTimerSpy,
        clearTimer: clearTimerSpy
      })

      poll.start('/wt/alpha')
      await vi.advanceTimersByTimeAsync(0)
      await vi.advanceTimersByTimeAsync(SYSTEM_SNAPSHOT_POLL_INTERVAL_MS)

      const slice = store.get().systemView
      expect(slice.view).toBe('open')
      if (slice.view === 'open') {
        expect(slice.graph.nodes.get('router:src/routes/users.ts')).toMatchObject({
          state: 'dirty',
          diff: { added: 34, removed: 8 }
        })
        expect(slice.graph.nodes.get('endpoint:src/routes/users.ts#0')).toMatchObject({
          state: 'dirty',
          diff: null
        })
      }
      poll.stop()
    })

    it('renders idle/null when the compare resolves but is not ready, and keeps polling', async () => {
      store.update({ graph: graphWithResolvableBaseRef() })
      const gateway = createFakeGateway(realisticSnapshot)
      gateway.gitBranchCompareImpl = async () =>
        readyCompare({ status: 'invalid-base', entries: [] })
      const poll = createSystemSnapshotPoll({
        store,
        gateway,
        onUnsupported,
        setTimer: setTimerSpy,
        clearTimer: clearTimerSpy
      })

      poll.start('/wt/alpha')
      await vi.advanceTimersByTimeAsync(0)
      await vi.advanceTimersByTimeAsync(SYSTEM_SNAPSHOT_POLL_INTERVAL_MS)

      const slice = store.get().systemView
      expect(slice.view).toBe('open')
      if (slice.view === 'open') {
        expect(slice.graph.nodes.get('router:src/routes/users.ts')).toMatchObject({
          state: 'idle',
          diff: null
        })
      }
      expect(gateway.calls).toBe(2)
      poll.stop()
    })

    it('keeps polling when gitBranchCompare rejects, with no unhandled rejection', async () => {
      store.update({ graph: graphWithResolvableBaseRef() })
      const gateway = createFakeGateway(realisticSnapshot)
      gateway.gitBranchCompareImpl = () => Promise.reject(new Error('boom'))
      const poll = createSystemSnapshotPoll({
        store,
        gateway,
        onUnsupported,
        setTimer: setTimerSpy,
        clearTimer: clearTimerSpy
      })

      poll.start('/wt/alpha')
      await vi.advanceTimersByTimeAsync(0)
      await vi.advanceTimersByTimeAsync(SYSTEM_SNAPSHOT_POLL_INTERVAL_MS)
      await vi.advanceTimersByTimeAsync(SYSTEM_SNAPSHOT_POLL_INTERVAL_MS)

      expect(gateway.calls).toBe(3)
      expect(store.get().systemView.view).toBe('open')
      poll.stop()
    })

    it('integration cadence guard: 6 ticks call systemSnapshot 6 times but gitBranchCompare once', async () => {
      store.update({ graph: graphWithResolvableBaseRef() })
      const gateway = createFakeGateway(realisticSnapshot)
      gateway.gitBranchCompareImpl = async () => readyCompare()
      const poll = createSystemSnapshotPoll({
        store,
        gateway,
        onUnsupported,
        setTimer: setTimerSpy,
        clearTimer: clearTimerSpy
      })

      poll.start('/wt/alpha')
      await vi.advanceTimersByTimeAsync(0)
      for (let i = 0; i < 5; i += 1) {
        await vi.advanceTimersByTimeAsync(SYSTEM_SNAPSHOT_POLL_INTERVAL_MS)
      }

      expect(gateway.calls).toBe(6)
      expect(gateway.compareCalls).toBe(1)
      poll.stop()
    })

    it('stop() stops the diff cache too — a late compare resolution causes no dispatch', async () => {
      store.update({ graph: graphWithResolvableBaseRef() })
      const gate = deferred<BranchCompare>()
      const gateway = createFakeGateway(realisticSnapshot)
      gateway.gitBranchCompareImpl = () => gate.promise
      const poll = createSystemSnapshotPoll({
        store,
        gateway,
        onUnsupported,
        setTimer: setTimerSpy,
        clearTimer: clearTimerSpy
      })

      poll.start('/wt/alpha')
      await vi.advanceTimersByTimeAsync(0)
      expect(gateway.compareCalls).toBe(1)

      poll.stop()
      const sliceBeforeResolve = store.get().systemView

      gate.resolve(readyCompare())
      await vi.advanceTimersByTimeAsync(0)

      expect(store.get().systemView).toEqual(sliceBeforeResolve)
    })

    it('rebindGateway rebinds both the snapshot gateway and the diff-cache gateway', async () => {
      store.update({ graph: graphWithResolvableBaseRef() })
      const gatewayA = createFakeGateway(realisticSnapshot)
      gatewayA.gitBranchCompareImpl = async () => readyCompare()
      const gatewayB = createFakeGateway(realisticSnapshot)
      gatewayB.gitBranchCompareImpl = async () => readyCompare()
      const poll = createSystemSnapshotPoll({
        store,
        gateway: gatewayA,
        onUnsupported,
        setTimer: setTimerSpy,
        clearTimer: clearTimerSpy
      })

      poll.start('/wt/alpha')
      await vi.advanceTimersByTimeAsync(0)
      expect(gatewayA.compareCalls).toBe(1)

      poll.rebindGateway(gatewayB)
      // past the diff cache's 10s refresh interval AND the next 1.5s tick boundary after it (10_500)
      await vi.advanceTimersByTimeAsync(12_000)

      expect(gatewayB.calls).toBeGreaterThan(0) // systemSnapshot swapped
      expect(gatewayA.compareCalls).toBe(1) // diff cache swapped — old gateway never called again
      expect(gatewayB.compareCalls).toBeGreaterThan(0)
      poll.stop()
    })
  })
})
