import { describe, expect, it } from 'vitest'
import { createGraphStore } from './graph-store'
import { syncWorktreeGraph } from './sync-worktree-graph'
import type { RuntimeGateway } from './ports/runtime-gateway'
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

describe('syncWorktreeGraph', () => {
  it('loads worktrees through the gateway into the store', async () => {
    const gateway: RuntimeGateway = { listWorktrees: async () => records }
    const store = createGraphStore()
    await syncWorktreeGraph(gateway, store, () => 1234)
    const state = store.get()
    expect(state.sync).toEqual({ state: 'synced', at: 1234 })
    expect(state.graph.nodes.size).toBe(2)
    expect(state.graph.edges).toEqual([{ from: 'repo::/a', to: 'repo::/b' }])
  })

  it('marks the store syncing while the fetch is in flight', async () => {
    let observed: string | null = null
    const store = createGraphStore()
    const gateway: RuntimeGateway = {
      listWorktrees: async () => {
        observed = store.get().sync.state
        return []
      }
    }
    await syncWorktreeGraph(gateway, store, () => 0)
    expect(observed).toBe('syncing')
  })

  it('records a failure without clobbering the previous graph', async () => {
    const store = createGraphStore()
    await syncWorktreeGraph({ listWorktrees: async () => records }, store, () => 1)
    const failing: RuntimeGateway = {
      listWorktrees: async () => {
        throw Object.assign(new Error('boom'), { code: 'runtime_unavailable' })
      }
    }
    await syncWorktreeGraph(failing, store, () => 2)
    const state = store.get()
    expect(state.sync).toEqual({ state: 'error', code: 'runtime_unavailable', message: 'boom' })
    expect(state.graph.nodes.size).toBe(2)
  })
})
