import { describe, expect, it, vi } from 'vitest'
import { createDiffViewBinder } from './bind-diff-view'
import type { BindDiffViewDeps } from './bind-diff-view'
import { createSceneStore } from './application/scene-store'
import type { SceneStore } from './application/scene-store'
import type { DiffLiveLoaderGatewayPort } from './application/diff-live-loader'
import type { BranchCompare, DiffFileContent } from './application/ports/runtime-gateway'
import type { WorktreeGraph, WorktreeNode } from './domain/worktree-graph/types'
import { emptyWorktreeGraph } from './domain/worktree-graph/types'
import { inertActivity } from './domain/worktree-graph/node-activity'
import type { DiffRailHandle } from './presentation/diff/diff-rail-element'
import type { DiffPanelHandle } from './presentation/diff/diff-panel-element'
import type { DiffHudHandle } from './presentation/diff/diff-hud-element'

/** Flushes pending microtasks/macrotasks so a loader's chained promises settle. */
const flush = async (): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, 0))
  await new Promise((resolve) => setTimeout(resolve, 0))
}

const node = (overrides: Partial<WorktreeNode> = {}): WorktreeNode => ({
  id: 'repo::/path/main',
  repoId: 'repo',
  branch: 'refs/heads/main',
  path: '/path/main',
  status: 'in-progress',
  isMain: true,
  kind: 'root',
  parentId: null,
  childIds: [],
  activity: inertActivity(),
  ...overrides
})

const graphOf = (nodes: readonly WorktreeNode[]): WorktreeGraph => {
  const graph = emptyWorktreeGraph()
  const byId = new Map(nodes.map((n) => [n.id, n]))
  return { ...graph, nodes: byId }
}

/** Sets up a main+child pair — repo::child resolves its base ref off repo::main. */
const setupGraph = (store: SceneStore): void => {
  const main = node({ id: 'repo::main', isMain: true, branch: 'refs/heads/main' })
  const child = node({
    id: 'repo::child',
    isMain: false,
    branch: 'refs/heads/child',
    parentId: 'repo::main'
  })
  store.update({ graph: graphOf([main, child]) })
}

const branchCompare = (overrides: Partial<BranchCompare> = {}): BranchCompare => ({
  changedFiles: 1,
  commitsAhead: 1,
  commitsBehind: 0,
  baseRef: 'refs/heads/main',
  headOid: 'head-oid',
  mergeBase: 'merge-base',
  status: 'ready',
  entries: [{ path: 'src/a.ts', status: 'modified', added: 3, removed: 1 }],
  ...overrides
})

type FakeGateway = DiffLiveLoaderGatewayPort & {
  compareCalls: Array<{ worktree: string; baseRef: string }>
  diffCalls: Array<{
    worktree: string
    compare: { mergeBase: string; headOid: string }
    filePath: string
    oldPath?: string
  }>
  gitBranchCompareImpl?: (worktree: string, baseRef: string) => Promise<BranchCompare>
}

function createFakeGateway(): FakeGateway {
  const gw: FakeGateway = {
    compareCalls: [],
    diffCalls: [],
    gitBranchCompare: async (worktree, baseRef) => {
      gw.compareCalls.push({ worktree, baseRef })
      if (gw.gitBranchCompareImpl) return gw.gitBranchCompareImpl(worktree, baseRef)
      return branchCompare()
    },
    gitBranchDiff: async (worktree, compare, filePath, oldPath) => {
      gw.diffCalls.push({
        worktree,
        compare,
        filePath,
        ...(oldPath === undefined ? {} : { oldPath })
      })
      const content: DiffFileContent = {
        kind: 'text',
        originalContent: 'a',
        modifiedContent: 'b',
        truncated: false
      }
      return content
    }
  }
  return gw
}

const createFakeRail = (): DiffRailHandle & {
  applyCalls: unknown[]
  emitSelect(path: string): void
} => {
  let selectCb: ((path: string) => void) | null = null
  return {
    root: {} as HTMLElement,
    applyCalls: [],
    apply(rows) {
      this.applyCalls.push(rows)
    },
    onSelect: vi.fn((cb: (path: string) => void) => (selectCb = cb)),
    dispose: vi.fn(),
    emitSelect(path: string) {
      selectCb?.(path)
    }
  }
}

const createFakePanel = (): DiffPanelHandle & { applyCalls: unknown[] } => ({
  element: {} as HTMLElement,
  applyCalls: [],
  apply(vm) {
    this.applyCalls.push(vm)
  },
  dispose: vi.fn()
})

const createFakeHud = (): DiffHudHandle & { applyCalls: unknown[] } => ({
  root: {} as HTMLElement,
  keyboardBar: { root: {} as HTMLElement, apply: vi.fn(), dispose: vi.fn() },
  applyCalls: [],
  apply(model) {
    this.applyCalls.push(model)
  },
  dispose: vi.fn()
})

function setup(gateway: DiffLiveLoaderGatewayPort) {
  const store = createSceneStore()
  const rails: ReturnType<typeof createFakeRail>[] = []
  const panels: ReturnType<typeof createFakePanel>[] = []
  const huds: ReturnType<typeof createFakeHud>[] = []
  const deps: BindDiffViewDeps = {
    store,
    diffSlot: { appendChild: vi.fn() },
    keyboardBarSlot: { appendChild: vi.fn() },
    demoGateway: gateway,
    createRail: () => {
      const rail = createFakeRail()
      rails.push(rail)
      return rail
    },
    createPanel: () => {
      const panel = createFakePanel()
      panels.push(panel)
      return panel
    },
    createHud: () => {
      const hud = createFakeHud()
      huds.push(hud)
      return hud
    }
  }
  const binder = createDiffViewBinder(deps)
  return { store, binder, rails, panels, huds }
}

describe('createDiffViewBinder', () => {
  it('open transition starts the loader: gitBranchCompare gets the focused node + resolved base ref, rail apply receives the row', async () => {
    const gateway = createFakeGateway()
    const { store, binder, rails } = setup(gateway)
    setupGraph(store)

    store.dispatchDiffView({ type: 'open', nodeId: 'repo::child', baseRef: 'refs/heads/main' })
    binder.sync()
    await flush()
    binder.sync()

    expect(gateway.compareCalls[0]).toEqual({ worktree: 'repo::child', baseRef: 'refs/heads/main' })
    expect(rails.at(-1)!.applyCalls.at(-1)).toMatchObject([{ path: 'src/a.ts' }])
  })

  it('closed: sync never calls gitBranchCompare', async () => {
    const gateway = createFakeGateway()
    const { binder } = setup(gateway)

    binder.sync()
    await flush()

    expect(gateway.compareCalls.length).toBe(0)
  })

  it('open then close: the loader stops — a later-resolving compare does not dispatch into the store', async () => {
    let resolveCompare!: (value: BranchCompare) => void
    const gateway = createFakeGateway()
    gateway.gitBranchCompareImpl = () =>
      new Promise((resolve) => {
        resolveCompare = resolve
      })
    const { store, binder } = setup(gateway)
    setupGraph(store)

    store.dispatchDiffView({ type: 'open', nodeId: 'repo::child', baseRef: 'refs/heads/main' })
    binder.sync()
    await Promise.resolve()

    store.dispatchDiffView({ type: 'close' })
    binder.sync()

    resolveCompare(branchCompare())
    await flush()

    expect(store.get().diffView).toEqual({ view: 'closed' })
  })

  it('a rail onSelect(path) forwards to gitBranchDiff with that path, and its oldPath when the row has one', async () => {
    const gateway = createFakeGateway()
    gateway.gitBranchCompareImpl = async () =>
      branchCompare({
        entries: [{ path: 'b.ts', status: 'renamed', oldPath: 'a.ts', added: 1, removed: 0 }]
      })
    const { store, binder, rails } = setup(gateway)
    setupGraph(store)

    store.dispatchDiffView({ type: 'open', nodeId: 'repo::child', baseRef: 'refs/heads/main' })
    binder.sync()
    await flush()
    binder.sync()

    rails.at(-1)!.emitSelect('b.ts')
    await flush()

    expect(gateway.diffCalls[0]).toEqual({
      worktree: 'repo::child',
      compare: { mergeBase: 'merge-base', headOid: 'head-oid' },
      filePath: 'b.ts',
      oldPath: 'a.ts'
    })
  })

  it('hud apply is called with the connection, the selected node branch, and the diff counts', async () => {
    const gateway = createFakeGateway()
    const { store, binder, huds } = setup(gateway)
    setupGraph(store)
    store.update({
      connection: { state: 'connected', runtimeId: 'rt-1' },
      selection: { selectedId: 'repo::child' }
    })

    store.dispatchDiffView({ type: 'open', nodeId: 'repo::child', baseRef: 'refs/heads/main' })
    binder.sync()
    await flush()
    binder.sync()

    expect(huds.at(-1)!.applyCalls.at(-1)).toMatchObject({
      connection: { state: 'connected', runtimeId: 'rt-1' },
      branch: 'refs/heads/child',
      counts: { files: 1, added: 3, removed: 1 }
    })
  })

  it('rebindGateway forwards to the loader — a later open uses the new gateway', async () => {
    const gatewayA = createFakeGateway()
    const gatewayB = createFakeGateway()
    const { store, binder } = setup(gatewayA)
    setupGraph(store)

    binder.rebindGateway(gatewayB)

    store.dispatchDiffView({ type: 'open', nodeId: 'repo::child', baseRef: 'refs/heads/main' })
    binder.sync()
    await flush()

    expect(gatewayB.compareCalls.length).toBe(1)
    expect(gatewayA.compareCalls.length).toBe(0)
  })
})
