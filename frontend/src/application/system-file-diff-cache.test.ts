import { describe, expect, it, vi } from 'vitest'
import {
  createSystemFileDiffCache,
  SYSTEM_FILE_DIFF_REFRESH_INTERVAL_MS
} from './system-file-diff-cache'
import type { SystemFileDiffGateway } from './system-file-diff-cache'
import { createSceneStore } from './scene-store'
import type { SceneStore } from './scene-store'
import type { BranchCompare, GitStatus } from './ports/runtime-gateway'
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

/** A worktree with no resolvable base ref (no baseRef, no parent, no main sibling in its repo). */
function graphWithLonelyNode(): WorktreeGraph {
  const graph = emptyWorktreeGraph()
  const lonely = node({
    id: 'orphan::lonely',
    repoId: 'orphan-repo',
    isMain: false,
    branch: 'refs/heads/lonely',
    parentId: null
  })
  return { ...graph, nodes: new Map([[lonely.id, lonely]]) }
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

const gitStatus = (overrides: Partial<GitStatus> = {}): GitStatus => ({
  entries: [],
  branch: 'refs/heads/child',
  branchLineTotal: 0,
  ...overrides
})

type FakeGateway = SystemFileDiffGateway & {
  calls: number
  impl?: () => Promise<BranchCompare>
  /** Absent by default (rejects) — most tests only care about the committed side. */
  statusImpl?: () => Promise<GitStatus>
}

function createFakeGateway(): FakeGateway {
  const gw: FakeGateway = {
    calls: 0,
    gitBranchCompare: async () => {
      gw.calls += 1
      if (gw.impl) return gw.impl()
      return branchCompare()
    },
    gitStatus: async () => {
      if (gw.statusImpl) return gw.statusImpl()
      throw new Error('gitStatus not configured')
    }
  }
  return gw
}

function setup(gateway: SystemFileDiffGateway, now?: () => number) {
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

  it('ignores a late result from a previous worktree (no cross-worktree leak)', async () => {
    const gateway = createFakeGateway()
    const late = deferred<BranchCompare>()
    gateway.impl = () => late.promise // first fetch (old worktree) hangs
    const { cache } = setup(gateway)

    cache.entriesFor('repo::child', 'k1')
    gateway.impl = async () =>
      branchCompare({ entries: [{ path: 'src/main.ts', status: 'added', added: 5, removed: 0 }] })
    cache.entriesFor('repo::main', 'k-main') // switch worktree while the old fetch is in flight
    await flush()
    await flush()
    late.resolve(branchCompare()) // old worktree's numbers land AFTER the switch
    await flush()
    await flush()

    expect(cache.entriesFor('repo::main', 'k-main')).toEqual([
      { path: 'src/main.ts', status: 'added', added: 5, removed: 0 }
    ])
    cache.stop()
  })

  it('serves fresh entries again after stop() when the view is reopened', async () => {
    const gateway = createFakeGateway()
    const { cache } = setup(gateway)

    cache.entriesFor('repo::child', 'k1')
    await flush()
    await flush()
    cache.stop()

    cache.entriesFor('repo::child', 'k1') // reopen: the poll restarts on the same cache
    await flush()
    await flush()

    expect(gateway.calls).toBe(2)
    expect(cache.entriesFor('repo::child', 'k1')).not.toBeNull()
    cache.stop()
  })

  it('calls onEntries once a refresh lands', async () => {
    const gateway = createFakeGateway()
    const onEntries = vi.fn()
    const store: SceneStore = createSceneStore()
    store.update({ graph: graphWithChild() })
    const cache = createSystemFileDiffCache({ store, gateway, onEntries })

    cache.entriesFor('repo::child', 'k1')
    await flush()
    await flush()

    expect(onEntries).toHaveBeenCalledTimes(1)
    cache.stop()
  })

  it('does not call onEntries for a superseded generation (worktree switch mid-flight)', async () => {
    const gateway = createFakeGateway()
    const late = deferred<BranchCompare>()
    gateway.impl = () => late.promise
    const onEntries = vi.fn()
    const store: SceneStore = createSceneStore()
    store.update({ graph: graphWithChild() })
    const cache = createSystemFileDiffCache({ store, gateway, onEntries })

    cache.entriesFor('repo::child', 'k1') // fetch hangs on `late`
    gateway.impl = async () => branchCompare()
    cache.entriesFor('repo::main', 'k-main') // switch — bumps the generation, discarding `late`
    await flush()
    await flush()
    expect(onEntries).toHaveBeenCalledTimes(1) // only repo::main's fetch landed

    late.resolve(branchCompare()) // repo::child's stale fetch resolves after the switch
    await flush()
    await flush()

    expect(onEntries).toHaveBeenCalledTimes(1) // still just one — the stale resolution is ignored
    cache.stop()
  })

  it('omitting onEntries changes nothing about entriesFor', async () => {
    const gateway = createFakeGateway()
    const store: SceneStore = createSceneStore()
    store.update({ graph: graphWithChild() })
    const cache = createSystemFileDiffCache({ store, gateway })

    cache.entriesFor('repo::child', 'k1')
    await flush()
    await flush()

    expect(cache.entriesFor('repo::child', 'k1')).not.toBeNull()
    cache.stop()
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

  it('refresh calls BOTH gitBranchCompare and gitStatus, merging shared and working-only rows', async () => {
    const gateway = createFakeGateway()
    gateway.impl = async () =>
      branchCompare({ entries: [{ path: 'src/a.ts', status: 'modified', added: 3, removed: 1 }] })
    gateway.statusImpl = async () =>
      gitStatus({
        entries: [
          { path: 'src/a.ts', status: 'modified', added: 2, removed: 0 },
          { path: 'src/b.ts', status: 'untracked', added: 5, removed: 0 }
        ]
      })
    const { cache } = setup(gateway)

    cache.entriesFor('repo::child', 'k1')
    await flush()
    await flush()

    expect(gateway.calls).toBe(1)
    expect(cache.entriesFor('repo::child', 'k1')).toEqual([
      { path: 'src/a.ts', status: 'modified', added: 5, removed: 1 },
      { path: 'src/b.ts', status: 'untracked', added: 5, removed: 0 }
    ])
    cache.stop()
  })

  it('no-base-ref plus a ready gitStatus still yields working-only rows, not null', async () => {
    const gateway = createFakeGateway()
    gateway.statusImpl = async () =>
      gitStatus({ entries: [{ path: 'src/local.ts', status: 'untracked', added: 4, removed: 0 }] })
    const store: SceneStore = createSceneStore()
    store.update({ graph: graphWithLonelyNode() })
    const cache = createSystemFileDiffCache({ store, gateway })

    cache.entriesFor('orphan::lonely', 'k1')
    await flush()
    await flush()

    expect(gateway.calls).toBe(0) // no base ref -> gitBranchCompare never called
    expect(cache.entriesFor('orphan::lonely', 'k1')).toEqual([
      { path: 'src/local.ts', status: 'untracked', added: 4, removed: 0 }
    ])
    cache.stop()
  })

  it('gitStatus throwing falls back to committed-only rows', async () => {
    const gateway = createFakeGateway() // statusImpl unset -> gitStatus rejects
    const { cache } = setup(gateway)

    cache.entriesFor('repo::child', 'k1')
    await flush()
    await flush()

    expect(cache.entriesFor('repo::child', 'k1')).toEqual([
      { path: 'src/a.ts', status: 'modified', added: 3, removed: 1 }
    ])
    cache.stop()
  })

  it('both sides unavailable yields null', async () => {
    const gateway = createFakeGateway() // statusImpl unset -> rejects
    gateway.impl = async () => branchCompare({ status: 'no-merge-base', entries: [] })
    const { cache } = setup(gateway)

    cache.entriesFor('repo::child', 'k1')
    await flush()
    await flush()

    expect(cache.entriesFor('repo::child', 'k1')).toBeNull()
    cache.stop()
  })

  it('generation guard holds when the two fetches resolve out of order across a worktree switch', async () => {
    const gateway = createFakeGateway()
    const lateCompare = deferred<BranchCompare>()
    const lateStatus = deferred<GitStatus>()
    gateway.impl = () => lateCompare.promise
    gateway.statusImpl = () => lateStatus.promise
    const { cache } = setup(gateway)

    cache.entriesFor('repo::child', 'k1') // both fetches hang

    gateway.impl = async () => branchCompare({ entries: [] })
    gateway.statusImpl = async () =>
      gitStatus({ entries: [{ path: 'src/main.ts', status: 'added', added: 1, removed: 0 }] })
    cache.entriesFor('repo::main', 'k-main') // switch — bumps the generation
    await flush()
    await flush()

    // stale resolutions land out of order, after the switch
    lateStatus.resolve(
      gitStatus({ entries: [{ path: 'src/stale.ts', status: 'added', added: 9, removed: 0 }] })
    )
    await flush()
    lateCompare.resolve(branchCompare())
    await flush()
    await flush()

    expect(cache.entriesFor('repo::main', 'k-main')).toEqual([
      { path: 'src/main.ts', status: 'added', added: 1, removed: 0 }
    ])
    cache.stop()
  })
})
