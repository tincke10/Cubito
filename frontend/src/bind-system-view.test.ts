import { describe, expect, it, vi } from 'vitest'
import { createSystemViewBinder } from './bind-system-view'
import type { BindSystemViewDeps } from './bind-system-view'
import { createSceneStore } from './application/scene-store'
import { RpcCallError } from './infrastructure/rpc/rpc-connection'
import type { SystemSnapshotPollGatewayPort } from './application/system-snapshot-poll'
import type { SystemGraphPort } from './application/ports/system-graph-port'
import type { SystemGraphHandle } from './presentation/system/system-graph-element'
import type { ActivityFeedHandle } from './presentation/system/activity-feed-element'
import type { SystemHudHandle } from './presentation/system/system-hud-element'
import { emptySystemGraph } from './domain/system-graph/types'
import type { SystemGraphSnapshot } from './application/ports/runtime-gateway'

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

function setup(overrides: { gateway: SystemSnapshotPollGatewayPort; graphPort?: SystemGraphPort }) {
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

describe('createSystemViewBinder', () => {
  it('real gateway bound: opening starts the poll, and the mapped snapshot reaches the store', async () => {
    const snapshot: SystemGraphSnapshot = {
      nodes: [{ id: 'router', kind: 'router', label: 'router', diff: null }],
      edges: []
    }
    const systemSnapshot = vi.fn(async () => snapshot)
    const { store, binder } = setup({ gateway: { systemSnapshot } })
    binder.rebindGateway({ systemSnapshot })

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
    const graphPort: SystemGraphPort = { loadSystemGraph: vi.fn(async () => emptySystemGraph()) }
    const { store, binder } = setup({ gateway: { systemSnapshot }, graphPort })
    binder.rebindGateway({ systemSnapshot })

    store.dispatchSystemView({ type: 'open', nodeId: '/wt/alpha' })
    binder.sync()
    await flush()

    expect(systemSnapshot).toHaveBeenCalledTimes(1)
    expect(graphPort.loadSystemGraph).toHaveBeenCalledWith('/wt/alpha') // fell back to the stub driver
  })

  it('offline (no rebindGateway call): opening goes straight to the scripted stub driver', async () => {
    const graphPort: SystemGraphPort = { loadSystemGraph: vi.fn(async () => emptySystemGraph()) }
    const systemSnapshot = vi.fn(async () => ({ nodes: [], edges: [] }))
    const { store, binder } = setup({ gateway: { systemSnapshot }, graphPort })
    // no binder.rebindGateway(...) — offline / `pnpm dev` path

    store.dispatchSystemView({ type: 'open', nodeId: '/wt/alpha' })
    binder.sync()
    await flush()

    expect(systemSnapshot).not.toHaveBeenCalled()
    expect(graphPort.loadSystemGraph).toHaveBeenCalledWith('/wt/alpha')
  })

  it('close stops both the poll and the stub driver — no further gateway calls after close', async () => {
    const systemSnapshot = vi.fn(async () => ({ nodes: [], edges: [] }))
    const { store, binder } = setup({ gateway: { systemSnapshot } })
    binder.rebindGateway({ systemSnapshot })

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
})
