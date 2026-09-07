import { describe, expect, it, vi } from 'vitest'
import { createSystemViewBinder } from './bind-system-view'
import type { BindSystemViewDeps, SystemViewGatewayPort } from './bind-system-view'
import { createSceneStore } from './application/scene-store'
import { RpcCallError } from './infrastructure/rpc/rpc-connection'
import type { SystemGraphPort } from './application/ports/system-graph-port'
import type { SystemGraphHandle } from './presentation/system/system-graph-element'
import type { ActivityFeedHandle } from './presentation/system/activity-feed-element'
import type { SystemHudHandle } from './presentation/system/system-hud-element'
import { emptySystemGraph } from './domain/system-graph/types'
import type { AgentActivityPage, SystemGraphSnapshot } from './application/ports/runtime-gateway'
import { AGENT_ACTIVITY_POLL_INTERVAL_MS } from './application/agent-activity-poll'
import type {
  SystemGraphStreamHandlers,
  SystemGraphStreamPort
} from './application/ports/system-graph-stream-port'

/** Flushes pending microtasks/macrotasks so a poll/driver's chained promises settle. */
const flush = async (): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, 0))
  await new Promise((resolve) => setTimeout(resolve, 0))
}

const createFakeGraph = (): SystemGraphHandle => ({
  element: {} as SystemGraphHandle['element'],
  apply: vi.fn(),
  dispose: vi.fn()
})

const createFakeFeed = (): ActivityFeedHandle => ({
  element: {} as HTMLElement,
  apply: vi.fn(),
  setSubtitle: vi.fn(),
  dispose: vi.fn()
})

const createFakeHud = (): SystemHudHandle => ({
  root: {} as HTMLElement,
  keyboardBar: { root: {} as HTMLElement, apply: vi.fn(), dispose: vi.fn() },
  apply: vi.fn(),
  dispose: vi.fn()
})

/** Never-resolves-anything-new agentActivity default — a test that cares overrides it explicitly. */
const createEmptyAgentActivity = () =>
  vi.fn(async (): Promise<AgentActivityPage> => ({ events: [], latestSeq: 0 }))

function setup(overrides: { gateway: SystemViewGatewayPort; graphPort?: SystemGraphPort }) {
  const store = createSceneStore()
  const graphPort: SystemGraphPort = overrides.graphPort ?? {
    loadSystemGraph: vi.fn(async () => emptySystemGraph())
  }
  const deps: BindSystemViewDeps = {
    store,
    systemSlot: { appendChild: vi.fn() },
    keyboardBarSlot: { appendChild: vi.fn() },
    demoGraphPort: graphPort,
    demoGateway: overrides.gateway,
    createGraph: createFakeGraph,
    createFeed: createFakeFeed,
    createHud: createFakeHud
  }
  const binder = createSystemViewBinder(deps)
  return { store, binder, graphPort }
}

/** Never-'ready' by default (mirrors main.ts's demo gateway) — a test that cares about real
 *  compare behavior overrides it explicitly. */
const createNotReadyCompare = () =>
  vi.fn(async () => ({
    changedFiles: 0,
    commitsAhead: 0,
    commitsBehind: 0,
    baseRef: '',
    headOid: '',
    mergeBase: '',
    status: '',
    entries: []
  }))

describe('createSystemViewBinder', () => {
  it('real gateway bound: opening starts the poll, and the mapped snapshot reaches the store', async () => {
    const snapshot: SystemGraphSnapshot = {
      nodes: [{ id: 'router', kind: 'router', label: 'router', diff: null }],
      edges: []
    }
    const systemSnapshot = vi.fn(async () => snapshot)
    const gitBranchCompare = createNotReadyCompare()
    const agentActivity = createEmptyAgentActivity()
    const { store, binder } = setup({
      gateway: { systemSnapshot, gitBranchCompare, agentActivity }
    })
    binder.rebindGateway({ systemSnapshot, gitBranchCompare, agentActivity })

    store.dispatchSystemView({ type: 'open', nodeId: '/wt/alpha' })
    binder.sync()
    await flush()

    expect(systemSnapshot).toHaveBeenCalledWith('/wt/alpha')
    const slice = store.get().systemView
    expect(slice.view).toBe('open')
    if (slice.view === 'open') expect(slice.graph.nodes.get('router')?.label).toBe('router')
  })

  it('method_not_found on a real gateway: falls back to the scripted stub driver for that open', async () => {
    const systemSnapshot = vi.fn(async () => {
      throw new RpcCallError('method_not_found', "Unknown method 'system.snapshot'.")
    })
    const gitBranchCompare = createNotReadyCompare()
    const agentActivity = createEmptyAgentActivity()
    const graphPort: SystemGraphPort = { loadSystemGraph: vi.fn(async () => emptySystemGraph()) }
    const { store, binder } = setup({
      gateway: { systemSnapshot, gitBranchCompare, agentActivity },
      graphPort
    })
    binder.rebindGateway({ systemSnapshot, gitBranchCompare, agentActivity })

    store.dispatchSystemView({ type: 'open', nodeId: '/wt/alpha' })
    binder.sync()
    await flush()

    expect(systemSnapshot).toHaveBeenCalledTimes(1)
    expect(graphPort.loadSystemGraph).toHaveBeenCalledWith('/wt/alpha') // fell back to the stub driver
  })

  it('offline (no rebindGateway call): opening goes straight to the scripted stub driver', async () => {
    const graphPort: SystemGraphPort = { loadSystemGraph: vi.fn(async () => emptySystemGraph()) }
    const systemSnapshot = vi.fn(async () => ({ nodes: [], edges: [] }))
    const gitBranchCompare = createNotReadyCompare()
    const agentActivity = createEmptyAgentActivity()
    const { store, binder } = setup({
      gateway: { systemSnapshot, gitBranchCompare, agentActivity },
      graphPort
    })
    // no binder.rebindGateway(...) — offline / `pnpm dev` path

    store.dispatchSystemView({ type: 'open', nodeId: '/wt/alpha' })
    binder.sync()
    await flush()

    expect(systemSnapshot).not.toHaveBeenCalled()
    expect(graphPort.loadSystemGraph).toHaveBeenCalledWith('/wt/alpha')
  })

  it('demo path (no rebindGateway): starts neither poll, only the scripted driver', async () => {
    const graphPort: SystemGraphPort = { loadSystemGraph: vi.fn(async () => emptySystemGraph()) }
    const systemSnapshot = vi.fn(async () => ({ nodes: [], edges: [] }))
    const gitBranchCompare = createNotReadyCompare()
    const agentActivity = createEmptyAgentActivity()
    const { store, binder } = setup({
      gateway: { systemSnapshot, gitBranchCompare, agentActivity },
      graphPort
    })

    store.dispatchSystemView({ type: 'open', nodeId: '/wt/alpha' })
    binder.sync()
    await flush()

    expect(systemSnapshot).not.toHaveBeenCalled()
    expect(agentActivity).not.toHaveBeenCalled()
    expect(graphPort.loadSystemGraph).toHaveBeenCalledWith('/wt/alpha')
  })

  it('does not call gitBranchCompare while the system view is closed', async () => {
    const systemSnapshot = vi.fn(async () => ({ nodes: [], edges: [] }))
    const gitBranchCompare = createNotReadyCompare()
    const agentActivity = createEmptyAgentActivity()
    const { binder } = setup({ gateway: { systemSnapshot, gitBranchCompare, agentActivity } })
    binder.rebindGateway({ systemSnapshot, gitBranchCompare, agentActivity })

    binder.sync() // systemView stays closed — no open dispatched
    await flush()

    expect(systemSnapshot).not.toHaveBeenCalled()
    expect(gitBranchCompare).not.toHaveBeenCalled()
    expect(agentActivity).not.toHaveBeenCalled()
  })

  it('close stops both the poll and the stub driver — no further gateway calls after close', async () => {
    const systemSnapshot = vi.fn(async () => ({ nodes: [], edges: [] }))
    const gitBranchCompare = createNotReadyCompare()
    const agentActivity = createEmptyAgentActivity()
    const { store, binder } = setup({
      gateway: { systemSnapshot, gitBranchCompare, agentActivity }
    })
    binder.rebindGateway({ systemSnapshot, gitBranchCompare, agentActivity })

    store.dispatchSystemView({ type: 'open', nodeId: '/wt/alpha' })
    binder.sync()
    await flush()
    const callsWhileOpen = systemSnapshot.mock.calls.length
    expect(callsWhileOpen).toBeGreaterThan(0)

    store.dispatchSystemView({ type: 'close' })
    binder.sync()
    await flush()

    expect(systemSnapshot.mock.calls.length).toBe(callsWhileOpen) // no more polling after close
  })

  it('closed -> open with a real gateway starts BOTH the snapshot poll and the activity poll', async () => {
    const systemSnapshot = vi.fn(async () => ({ nodes: [], edges: [] }))
    const gitBranchCompare = createNotReadyCompare()
    const agentActivity = createEmptyAgentActivity()
    const { store, binder } = setup({
      gateway: { systemSnapshot, gitBranchCompare, agentActivity }
    })
    binder.rebindGateway({ systemSnapshot, gitBranchCompare, agentActivity })

    store.dispatchSystemView({ type: 'open', nodeId: '/wt/alpha' })
    binder.sync()
    await flush()

    expect(systemSnapshot).toHaveBeenCalledWith('/wt/alpha')
    expect(agentActivity).toHaveBeenCalledWith({
      worktree: '/wt/alpha',
      sinceSeq: 0,
      limit: 50
    })
  })

  it('open -> closed stops both the snapshot poll and the activity poll', async () => {
    const systemSnapshot = vi.fn(async () => ({ nodes: [], edges: [] }))
    const gitBranchCompare = createNotReadyCompare()
    const agentActivity = createEmptyAgentActivity()
    const { store, binder } = setup({
      gateway: { systemSnapshot, gitBranchCompare, agentActivity }
    })
    binder.rebindGateway({ systemSnapshot, gitBranchCompare, agentActivity })

    store.dispatchSystemView({ type: 'open', nodeId: '/wt/alpha' })
    binder.sync()
    await flush()
    const activityCallsWhileOpen = agentActivity.mock.calls.length
    expect(activityCallsWhileOpen).toBeGreaterThan(0)

    store.dispatchSystemView({ type: 'close' })
    binder.sync()
    await flush()

    expect(agentActivity.mock.calls.length).toBe(activityCallsWhileOpen) // no more activity polling after close
  })

  it('rebindGateway forwards to both the snapshot poll and the activity poll', async () => {
    vi.useFakeTimers()
    try {
      const systemSnapshotA = vi.fn(async () => ({ nodes: [], edges: [] }))
      const gitBranchCompareA = createNotReadyCompare()
      const agentActivityA = createEmptyAgentActivity()
      const systemSnapshotB = vi.fn(async () => ({ nodes: [], edges: [] }))
      const gitBranchCompareB = createNotReadyCompare()
      const agentActivityB = createEmptyAgentActivity()
      const { store, binder } = setup({
        gateway: {
          systemSnapshot: systemSnapshotA,
          gitBranchCompare: gitBranchCompareA,
          agentActivity: agentActivityA
        }
      })
      binder.rebindGateway({
        systemSnapshot: systemSnapshotA,
        gitBranchCompare: gitBranchCompareA,
        agentActivity: agentActivityA
      })

      store.dispatchSystemView({ type: 'open', nodeId: '/wt/alpha' })
      binder.sync()
      await vi.advanceTimersByTimeAsync(0)
      expect(agentActivityA).toHaveBeenCalled()

      binder.rebindGateway({
        systemSnapshot: systemSnapshotB,
        gitBranchCompare: gitBranchCompareB,
        agentActivity: agentActivityB
      })
      await vi.advanceTimersByTimeAsync(AGENT_ACTIVITY_POLL_INTERVAL_MS)

      expect(agentActivityB).toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('activity onUnsupported does not start the scripted driver — the placeholder feed stays, snapshot poll keeps running', async () => {
    const systemSnapshot = vi.fn(async () => ({ nodes: [], edges: [] }))
    const gitBranchCompare = createNotReadyCompare()
    const agentActivity = vi.fn(async (): Promise<AgentActivityPage> => {
      throw new RpcCallError('method_not_found', "Unknown method 'agent.activity'.")
    })
    const graphPort: SystemGraphPort = { loadSystemGraph: vi.fn(async () => emptySystemGraph()) }
    const { store, binder } = setup({
      gateway: { systemSnapshot, gitBranchCompare, agentActivity },
      graphPort
    })
    binder.rebindGateway({ systemSnapshot, gitBranchCompare, agentActivity })

    store.dispatchSystemView({ type: 'open', nodeId: '/wt/alpha' })
    binder.sync()
    await flush()

    expect(agentActivity).toHaveBeenCalledTimes(1)
    expect(graphPort.loadSystemGraph).not.toHaveBeenCalled() // scripted driver never starts
    const callsAfterUnsupported = systemSnapshot.mock.calls.length
    expect(callsAfterUnsupported).toBeGreaterThan(0) // snapshot poll keeps running
  })

  it('opening with a stream port bound never calls systemSnapshot (Wave F3 source)', async () => {
    const systemSnapshot = vi.fn(async () => ({ nodes: [], edges: [] }))
    const gitBranchCompare = createNotReadyCompare()
    const agentActivity = createEmptyAgentActivity()
    const { store, binder } = setup({
      gateway: { systemSnapshot, gitBranchCompare, agentActivity }
    })
    const watch = vi.fn((_worktree: string, _handlers: SystemGraphStreamHandlers) => ({
      close: vi.fn()
    }))
    const streamPort: SystemGraphStreamPort = { watch }
    binder.rebindGateway({ systemSnapshot, gitBranchCompare, agentActivity }, streamPort)

    store.dispatchSystemView({ type: 'open', nodeId: '/wt/alpha' })
    binder.sync()
    await flush()

    expect(watch).toHaveBeenCalledWith('/wt/alpha', expect.anything())
    expect(systemSnapshot).not.toHaveBeenCalled()
  })
})
