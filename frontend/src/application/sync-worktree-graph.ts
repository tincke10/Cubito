import { buildWorktreeGraph } from '../domain/worktree-graph/build-graph'
import type { GraphStore } from './graph-store'
import type { RuntimeGateway } from './ports/runtime-gateway'

/**
 * Use case: refresh the worktree graph from the runtime. On failure the
 * previous graph is kept — a stale scene beats an empty one.
 */
export async function syncWorktreeGraph(
  gateway: RuntimeGateway,
  store: GraphStore,
  now: () => number = Date.now
): Promise<void> {
  store.set({ graph: store.get().graph, sync: { state: 'syncing' } })
  try {
    const records = await gateway.listWorktrees()
    store.set({ graph: buildWorktreeGraph(records), sync: { state: 'synced', at: now() } })
  } catch (error) {
    const code =
      typeof error === 'object' && error !== null && 'code' in error
        ? String((error as { code: unknown }).code)
        : 'unknown'
    const message = error instanceof Error ? error.message : String(error)
    store.set({ graph: store.get().graph, sync: { state: 'error', code, message } })
  }
}
