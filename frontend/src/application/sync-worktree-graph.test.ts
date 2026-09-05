import { describe, expect, it, vi } from 'vitest'
import { createSceneStore } from './scene-store'
import { syncWorktreeGraph } from './sync-worktree-graph'
import { FANOUT_PLACEHOLDER_PREFIX } from './fan-out-model'
import type { RepoSummary, RuntimeGateway } from './ports/runtime-gateway'
import type { RawWorktreeRecord } from '../domain/worktree-graph/build-graph'

const records: RawWorktreeRecord[] = [
  {
    id: 'repo::/a',
    branch: 'refs/heads/main',
    parentWorktreeId: null,
    childWorktreeIds: ['repo::/b'],
    workspaceStatus: 'in-progress',
    git: { path: '/a', isMainWorktree: true }
  },
  {
    id: 'repo::/b',
    branch: 'refs/heads/task',
    parentWorktreeId: 'repo::/a',
    childWorktreeIds: [],
    workspaceStatus: 'in-progress',
    git: { path: '/b', isMainWorktree: false }
  }
]

/** Minimal RuntimeGateway fake — spawn's createWorktree is untested here (see spawn-menu-model.test.ts). */
const fakeGateway = (
  listWorktrees: () => Promise<RawWorktreeRecord[]>,
  listRepos: () => Promise<readonly RepoSummary[]> = async () => []
): RuntimeGateway => ({
  listWorktrees,
  listRepos,
  createWorktree: async () => {
    throw new Error('createWorktree not implemented in this fake')
  },
  addRepo: async () => {
    throw new Error('addRepo not implemented in this fake')
  },
  listWorktreePs: async () => []
})

describe('syncWorktreeGraph', () => {
  it('loads worktrees through the gateway into the store', async () => {
    const gateway = fakeGateway(async () => records)
    const store = createSceneStore()
    await syncWorktreeGraph(gateway, store, () => 1234)
    const state = store.get()
    expect(state.sync).toEqual({ state: 'synced', at: 1234 })
    expect(state.graph.nodes.size).toBe(2)
    expect(state.graph.edges).toEqual([{ from: 'repo::/a', to: 'repo::/b' }])
  })

  it('marks the store syncing while the fetch is in flight', async () => {
    let observed: string | null = null
    const store = createSceneStore()
    const gateway = fakeGateway(async () => {
      observed = store.get().sync.state
      return []
    })
    await syncWorktreeGraph(gateway, store, () => 0)
    expect(observed).toBe('syncing')
  })

  it('records a failure without clobbering the previous graph', async () => {
    const store = createSceneStore()
    await syncWorktreeGraph(
      fakeGateway(async () => records),
      store,
      () => 1
    )
    const failing = fakeGateway(async () => {
      throw Object.assign(new Error('boom'), { code: 'runtime_unavailable' })
    })
    await syncWorktreeGraph(failing, store, () => 2)
    const state = store.get()
    expect(state.sync).toEqual({ state: 'error', code: 'runtime_unavailable', message: 'boom' })
    expect(state.graph.nodes.size).toBe(2)
  })

  it('never calls store.set — only store.update', async () => {
    const store = createSceneStore()
    const setSpy = vi.spyOn(store, 'set')
    await syncWorktreeGraph(
      fakeGateway(async () => records),
      store,
      () => 1
    )
    const failing = fakeGateway(async () => {
      throw new Error('boom')
    })
    await syncWorktreeGraph(failing, store, () => 2)
    expect(setSpy).not.toHaveBeenCalled()
  })

  describe('selection survives sync (regression)', () => {
    it('through the success path, when the selected node is still present', async () => {
      const store = createSceneStore()
      store.update({ selection: { selectedId: 'repo::/b' } })
      await syncWorktreeGraph(
        fakeGateway(async () => records),
        store,
        () => 1
      )
      expect(store.get().selection.selectedId).toBe('repo::/b')
    })

    it('through the error path', async () => {
      const store = createSceneStore()
      await syncWorktreeGraph(
        fakeGateway(async () => records),
        store,
        () => 1
      )
      store.update({ selection: { selectedId: 'repo::/b' } })
      const failing = fakeGateway(async () => {
        throw new Error('boom')
      })
      await syncWorktreeGraph(failing, store, () => 2)
      expect(store.get().selection.selectedId).toBe('repo::/b')
    })
  })

  describe('repos sync', () => {
    const repoSummaries: RepoSummary[] = [
      { id: 'r1', path: '/r1', displayName: 'Repo One', kind: 'git' },
      { id: 'r2', path: '/r2', displayName: 'Repo Two', kind: 'git' }
    ]

    it('populates repos and reconciles activeRepoId from repo.list, alongside the worktree fetch', async () => {
      const store = createSceneStore()
      const gateway = fakeGateway(
        async () => records,
        async () => repoSummaries
      )
      await syncWorktreeGraph(gateway, store, () => 1)
      const state = store.get()
      expect(state.repos.list).toEqual(repoSummaries)
      expect(state.repos.activeRepoId).toBe('r1')
      expect(state.graph.nodes.size).toBe(2)
    })

    it('a repo.list failure leaves the graph and the prior repos slice intact (best-effort)', async () => {
      const store = createSceneStore()
      await syncWorktreeGraph(
        fakeGateway(
          async () => records,
          async () => repoSummaries
        ),
        store,
        () => 1
      )
      const failingRepos = fakeGateway(
        async () => records,
        async () => {
          throw new Error('repo.list boom')
        }
      )
      await syncWorktreeGraph(failingRepos, store, () => 2)
      const state = store.get()
      expect(state.graph.nodes.size).toBe(2)
      expect(state.sync).toEqual({ state: 'synced', at: 2 })
      expect(state.repos.list).toEqual(repoSummaries)
      expect(state.repos.activeRepoId).toBe('r1')
    })
  })

  describe('vanished-node fallback', () => {
    it('reconciles to the surviving parent when the selected leaf disappears', async () => {
      const store = createSceneStore()
      await syncWorktreeGraph(
        fakeGateway(async () => records),
        store,
        () => 1
      )
      store.update({ selection: { selectedId: 'repo::/b' } })

      // repo::/b is gone; repo::/a's raw childWorktreeIds still names it (stale-until-next-sync),
      // which is exactly the data reconcileSelection's ancestor-walk relies on.
      const afterRemoval: RawWorktreeRecord[] = [
        {
          id: 'repo::/a',
          branch: 'refs/heads/main',
          parentWorktreeId: null,
          childWorktreeIds: ['repo::/b'],
          workspaceStatus: 'in-progress',
          git: { path: '/a', isMainWorktree: true }
        }
      ]
      await syncWorktreeGraph(
        fakeGateway(async () => afterRemoval),
        store,
        () => 2
      )
      expect(store.get().selection.selectedId).toBe('repo::/a')
    })

    it('falls back to initialSelection when no surviving ancestor reference remains', async () => {
      const store = createSceneStore()
      await syncWorktreeGraph(
        fakeGateway(async () => records),
        store,
        () => 1
      )
      store.update({ selection: { selectedId: 'repo::/b' } })

      // The whole subtree (parent + child) vanished in one sync — no surviving node
      // references repo::/b any more, so there is no ancestor to walk to.
      const unrelatedRoot: RawWorktreeRecord[] = [
        {
          id: 'repo::/c',
          branch: 'refs/heads/main',
          parentWorktreeId: null,
          childWorktreeIds: [],
          workspaceStatus: 'in-progress',
          git: { path: '/c', isMainWorktree: true }
        }
      ]
      await syncWorktreeGraph(
        fakeGateway(async () => unrelatedRoot),
        store,
        () => 2
      )
      expect(store.get().selection.selectedId).toBe('repo::/c')
    })

    it('never throws and never leaves selection dangling on a vanished id', async () => {
      const store = createSceneStore()
      await syncWorktreeGraph(
        fakeGateway(async () => records),
        store,
        () => 1
      )
      store.update({ selection: { selectedId: 'repo::/b' } })
      await syncWorktreeGraph(
        fakeGateway(async () => []),
        store,
        () => 2
      )
      const state = store.get()
      expect(state.selection.selectedId).toBeNull()
      expect(state.graph.nodes.has('repo::/b')).toBe(false)
    })
  })

  describe('fan-out overlay (composeFanOutGraph on every poll)', () => {
    it('drops a placeholder once its entry resolves to a real worktree id, and keeps the still-pending one', async () => {
      const store = createSceneStore()
      await syncWorktreeGraph(
        fakeGateway(async () => records),
        store,
        () => 1
      )
      store.dispatchFanOut({ type: 'open-for-node', nodeId: 'repo::/a' })
      store.dispatchFanOut({ type: 'set-repo-selector', repoSelector: 'id:repo' })
      store.dispatchFanOut({ type: 'submit', mutationIds: ['m1', 'm2'] })
      expect(store.get().graph.nodes.has(`${FANOUT_PLACEHOLDER_PREFIX}m1`)).toBe(true)

      store.dispatchFanOut({ type: 'child-created', mutationId: 'm1', worktreeId: 'repo::/c' })
      const recordsWithChild: RawWorktreeRecord[] = [
        ...records,
        {
          id: 'repo::/c',
          branch: 'refs/heads/fanout-1',
          parentWorktreeId: 'repo::/a',
          childWorktreeIds: [],
          workspaceStatus: 'in-progress',
          git: { path: '/c', isMainWorktree: false }
        }
      ]
      await syncWorktreeGraph(
        fakeGateway(async () => recordsWithChild),
        store,
        () => 2
      )
      const state = store.get()
      expect(state.graph.nodes.has(`${FANOUT_PLACEHOLDER_PREFIX}m1`)).toBe(false)
      expect(state.graph.nodes.has('repo::/c')).toBe(true)
      expect(state.graph.nodes.has(`${FANOUT_PLACEHOLDER_PREFIX}m2`)).toBe(true)
    })

    it('overlays memberStatus onto a real node even though listWorktrees never carries agentStatus', async () => {
      const store = createSceneStore()
      await syncWorktreeGraph(
        fakeGateway(async () => records),
        store,
        () => 1
      )
      store.dispatchFanOut({ type: 'open-for-node', nodeId: 'repo::/a' })
      store.dispatchFanOut({ type: 'set-repo-selector', repoSelector: 'id:repo' })
      store.dispatchFanOut({ type: 'submit', mutationIds: ['m1'] })
      store.dispatchFanOut({ type: 'child-created', mutationId: 'm1', worktreeId: 'repo::/c' })
      store.dispatchFanOut({ type: 'member-status', worktreeId: 'repo::/c', status: 'working' })

      const recordsWithChild: RawWorktreeRecord[] = [
        ...records,
        {
          id: 'repo::/c',
          branch: 'refs/heads/fanout-1',
          parentWorktreeId: 'repo::/a',
          childWorktreeIds: [],
          workspaceStatus: 'in-progress',
          git: { path: '/c', isMainWorktree: false }
        }
      ]
      await syncWorktreeGraph(
        fakeGateway(async () => recordsWithChild),
        store,
        () => 2
      )
      expect(store.get().graph.nodes.get('repo::/c')?.activity.agentStatus).toBe('working')
    })
  })
})
