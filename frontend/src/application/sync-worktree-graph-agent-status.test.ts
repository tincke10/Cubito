import { describe, expect, it, vi } from 'vitest'
import { createSceneStore } from './scene-store'
import { syncWorktreeGraph } from './sync-worktree-graph'
import type { SyncGatewayPort } from './sync-worktree-graph'
import type { WorktreePsRow } from './ports/runtime-gateway'
import type { RawWorktreeRecord } from '../domain/worktree-graph/build-graph'
import { countNodeStates } from '../presentation/theme/node-state'

const record = (id: string, parent: string | null, children: string[]): RawWorktreeRecord => ({
  id,
  branch: `refs/heads/${id}`,
  parentWorktreeId: parent,
  childWorktreeIds: children,
  workspaceStatus: 'in-progress',
  git: { path: id.replace('repo::', ''), isMainWorktree: parent === null }
})

const records = [record('repo::/a', null, ['repo::/b']), record('repo::/b', 'repo::/a', [])]

const gatewayWith = (listWorktreePs: () => Promise<readonly WorktreePsRow[]>): SyncGatewayPort => ({
  listWorktrees: async () => records,
  listRepos: async () => [],
  listWorktreePs
})

const statusOf = (store: ReturnType<typeof createSceneStore>, id: string) =>
  store.get().graph.nodes.get(id)?.activity.agentStatus

describe('syncWorktreeGraph agent status overlay', () => {
  it('shows a plain-spawned node as working from worktree.ps', async () => {
    const store = createSceneStore()
    await syncWorktreeGraph(
      gatewayWith(async () => [{ worktreeId: 'repo::/b', status: 'working' }]),
      store,
      () => 1
    )
    expect(statusOf(store, 'repo::/b')).toBe('working')
    expect(countNodeStates(store.get().graph).working).toBe(1)
  })

  it('shows a permission row as waiting-input', async () => {
    const store = createSceneStore()
    await syncWorktreeGraph(
      gatewayWith(async () => [{ worktreeId: 'repo::/b', status: 'permission' }]),
      store,
      () => 1
    )
    expect(statusOf(store, 'repo::/b')).toBe('waiting-input')
    expect(countNodeStates(store.get().graph)['waiting-input']).toBe(1)
  })

  it('still syncs the graph and keeps the previous status when worktree.ps rejects', async () => {
    const store = createSceneStore()
    await syncWorktreeGraph(
      gatewayWith(async () => [{ worktreeId: 'repo::/b', status: 'working' }]),
      store,
      () => 1
    )
    await syncWorktreeGraph(
      gatewayWith(async () => {
        throw new Error('method_not_found')
      }),
      store,
      () => 2
    )
    expect(store.get().sync.state).toBe('synced')
    expect(store.get().graph.nodes.size).toBe(2)
    expect(statusOf(store, 'repo::/b')).toBe('working')
  })

  it('lets fan-out memberStatus win over ps for camada members', async () => {
    const store = createSceneStore()
    const gateway = gatewayWith(async () => [{ worktreeId: 'repo::/b', status: 'working' }])
    await syncWorktreeGraph(gateway, store, () => 1)
    store.dispatchFanOut({ type: 'open-for-node', nodeId: 'repo::/a' })
    store.dispatchFanOut({ type: 'set-repo-selector', repoSelector: 'id:repo' })
    store.dispatchFanOut({ type: 'submit', mutationIds: ['m1'] })
    store.dispatchFanOut({ type: 'child-created', mutationId: 'm1', worktreeId: 'repo::/b' })
    store.dispatchFanOut({ type: 'member-status', worktreeId: 'repo::/b', status: 'waiting-input' })
    await syncWorktreeGraph(gateway, store, () => 2)
    expect(statusOf(store, 'repo::/b')).toBe('waiting-input')
  })

  it('calls listWorktreePs exactly once per sync', async () => {
    const store = createSceneStore()
    const listWorktreePs = vi.fn(async () => [])
    await syncWorktreeGraph(gatewayWith(listWorktreePs), store, () => 1)
    expect(listWorktreePs).toHaveBeenCalledTimes(1)
  })
})
