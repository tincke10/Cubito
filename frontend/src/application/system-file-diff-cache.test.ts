import { describe, expect, it } from 'vitest'
import {
  createSystemFileDiffCache,
  SYSTEM_FILE_DIFF_REFRESH_INTERVAL_MS
} from './system-file-diff-cache'
import type { BranchCompareEntriesGateway } from './branch-compare-entries-fetch'
import { createSceneStore } from './scene-store'
import type { SceneStore } from './scene-store'
import type { BranchCompare } from './ports/runtime-gateway'
import type { WorktreeGraph, WorktreeNode } from '../domain/worktree-graph/types'
import { emptyWorktreeGraph } from '../domain/worktree-graph/types'
import { inertActivity } from '../domain/worktree-graph/node-activity'

/** Flushes pending microtasks/macrotasks so a cache's chained promises settle (mirrors
 *  bind-system-view.test.ts) — robust to fakes that return a promise from an async function,
 *  which adds an extra microtask hop over a plain-value return. */
const flush = async (): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, 0))
  await new Promise((resolve) => setTimeout(resolve, 0))
}

type Deferred<T> = { promise: Promise<T>; resolve: (v: T) => void }

function deferred<T>(): Deferred<T> {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
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

function graphWithChild(): WorktreeGraph {
  const graph = emptyWorktreeGraph()
  const main = node({ id: 'repo::main', isMain: true, branch: 'refs/heads/main' })
  const child = node({
    id: 'repo::child',
    isMain: false,
    branch: 'refs/heads/child',
    parentId: 'repo::main'
  })
  return {
    ...graph,
    nodes: new Map([
      [main.id, main],
      [child.id, child]
    ])
  }
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

type FakeGateway = BranchCompareEntriesGateway & {
  calls: number
  impl?: () => Promise<BranchCompare>
}

function createFakeGateway(): FakeGateway {
  const gw: FakeGateway = {
    calls: 0,
    gitBranchCompare: async () => {
      gw.calls += 1
      if (gw.impl) return gw.impl()
      return branchCompare()
    }
  }
  return gw
}

function setup(gateway: BranchCompareEntriesGateway, now?: () => number) {
  const store: SceneStore = createSceneStore()
  store.update({ graph: graphWithChild() })
  const cache = createSystemFileDiffCache({ store, gateway, ...(now ? { now } : {}) })
  return { store, cache }
}

describe('createSystemFileDiffCache', () => {
  it('returns null before the first compare resolves, having kicked a fetch', () => {
    const gateway = createFakeGateway()
    const { cache } = setup(gateway)

    const result = cache.entriesFor('repo::child', 'k1')

    expect(result).toBeNull()
    expect(gateway.calls).toBe(1)
    cache.stop()
  })

  it('returns resolved entries on the next call after flushing microtasks', async () => {
    const gateway = createFakeGateway()
    const { cache } = setup(gateway)

    cache.entriesFor('repo::child', 'k1')
    await flush()
    await flush()

    expect(cache.entriesFor('repo::child', 'k1')).toEqual([
      { path: 'src/a.ts', status: 'modified', added: 3, removed: 1 }
    ])
    cache.stop()
  })

  it('cadence guard: 8 calls with the same worktree+key call gitBranchCompare exactly once', async () => {
    const gateway = createFakeGateway()
    let clock = 0
    const { cache } = setup(gateway, () => clock)

    for (let i = 0; i < 8; i += 1) {
      cache.entriesFor('repo::child', 'k1')
      await flush()
    }

    expect(gateway.calls).toBe(1)
    cache.stop()
  })

  it('refetches once the refresh interval elapses', async () => {
    const gateway = createFakeGateway()
    let clock = 0
    const { cache } = setup(gateway, () => clock)

    cache.entriesFor('repo::child', 'k1')
    await flush()
    await flush()
    expect(gateway.calls).toBe(1)

    clock += SYSTEM_FILE_DIFF_REFRESH_INTERVAL_MS
    cache.entriesFor('repo::child', 'k1')
    await flush()
    await flush()

    expect(gateway.calls).toBe(2)
    cache.stop()
  })

  it('refetches immediately when the file-set key changes inside the window', async () => {
    const gateway = createFakeGateway()
    let clock = 0
    const { cache } = setup(gateway, () => clock)

    cache.entriesFor('repo::child', 'k1')
    await flush()
    await flush()
    expect(gateway.calls).toBe(1)

    cache.entriesFor('repo::child', 'k2')
    await flush()
    await flush()

    expect(gateway.calls).toBe(2)
    cache.stop()
  })

  it('never stacks concurrent fetches for the same worktree+key', () => {
    const gateway = createFakeGateway()
    gateway.impl = () => new Promise<BranchCompare>(() => {}) // never resolves
    const { cache } = setup(gateway)

    for (let i = 0; i < 5; i += 1) {
      cache.entriesFor('repo::child', 'k1')
    }

    expect(gateway.calls).toBe(1)
    cache.stop()
  })

  it('drops entries to null when the worktree changes, and refetches', async () => {
    const gateway = createFakeGateway()
    const { cache } = setup(gateway)

    cache.entriesFor('repo::child', 'k1')
    await flush()
    await flush()
    expect(cache.entriesFor('repo::child', 'k1')).not.toBeNull()

    const result = cache.entriesFor('repo::main', 'k-main')

    expect(result).toBeNull()
    expect(gateway.calls).toBe(2)
    cache.stop()
  })

  it('drops to null when the compare stops being resolvable', async () => {
    const gateway = createFakeGateway()
    let clock = 0
    const { cache } = setup(gateway, () => clock)

    cache.entriesFor('repo::child', 'k1')
    await flush()
    await flush()
    expect(cache.entriesFor('repo::child', 'k1')).not.toBeNull()

    gateway.impl = async () => branchCompare({ status: 'no-merge-base', entries: [] })
    clock += SYSTEM_FILE_DIFF_REFRESH_INTERVAL_MS
    cache.entriesFor('repo::child', 'k1') // kicks the refetch, still returns stale synchronously
    await flush()
    await flush()

    expect(cache.entriesFor('repo::child', 'k1')).toBeNull()
    cache.stop()
  })

  it('backs off a full interval after a failed fetch (no hot loop)', async () => {
    const gateway = createFakeGateway()
    gateway.impl = () => Promise.reject(new Error('boom'))
    let clock = 0
    const { cache } = setup(gateway, () => clock)

    cache.entriesFor('repo::child', 'k1')
    await flush()
    await flush()
    expect(gateway.calls).toBe(1)

    cache.entriesFor('repo::child', 'k1')
    await flush()
    expect(gateway.calls).toBe(1) // still within the interval — no retry

    clock += SYSTEM_FILE_DIFF_REFRESH_INTERVAL_MS
    cache.entriesFor('repo::child', 'k1')
    await flush()

    expect(gateway.calls).toBe(2)
    cache.stop()
  })

  it('stop() prevents a late resolution from writing entries', async () => {
    const gateway = createFakeGateway()
    const gate = deferred<BranchCompare>()
    gateway.impl = () => gate.promise
    const { cache } = setup(gateway)

    cache.entriesFor('repo::child', 'k1')
    cache.stop()
    gate.resolve(branchCompare())
    await flush()
    await flush()

    expect(cache.entriesFor('repo::child', 'k1')).toBeNull()
  })

  it('rebindGateway routes the next fetch to the new gateway', async () => {
    const gatewayA = createFakeGateway()
    const gatewayB = createFakeGateway()
    gatewayB.impl = async () =>
      branchCompare({ entries: [{ path: 'src/b.ts', status: 'added', added: 1, removed: 0 }] })
    const { cache } = setup(gatewayA)

    cache.entriesFor('repo::child', 'k1')
    await flush()
    await flush()
    expect(gatewayA.calls).toBe(1)

    cache.rebindGateway(gatewayB)
    cache.entriesFor('repo::child', 'k2')
    await flush()
    await flush()

    expect(gatewayB.calls).toBe(1)
    expect(cache.entriesFor('repo::child', 'k2')).toEqual([
      { path: 'src/b.ts', status: 'added', added: 1, removed: 0 }
    ])
    cache.stop()
  })
})
