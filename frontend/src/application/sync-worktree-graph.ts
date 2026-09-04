import { buildWorktreeGraph } from '../domain/worktree-graph/build-graph'
import { reconcileSelection } from '../presentation/navigation/selection-model'
import type { SceneStore } from './scene-store'
import type { RuntimeGateway } from './ports/runtime-gateway'

/**
 * Use case: refresh the worktree graph from the runtime. On failure the
 * previous graph is kept — a stale scene beats an empty one. Selection is
 * reconciled against the freshly built graph so it survives every sync.
 * `repo.list` rides the same cycle but is best-effort: a failure keeps the
 * prior repos slice and never clears the graph (design Area 3).
 */
export async function syncWorktreeGraph(
  gateway: RuntimeGateway,
  store: SceneStore,
  now: () => number = Date.now
): Promise<void> {
  store.update({ sync: { state: 'syncing' } })
  const [worktreesResult, reposResult] = await Promise.allSettled([
    gateway.listWorktrees(),
    gateway.listRepos()
  ])

  if (worktreesResult.status === 'fulfilled') {
    const graph = buildWorktreeGraph(worktreesResult.value)
    const selectedId = reconcileSelection(graph, store.get().selection.selectedId)
    store.update({ graph, sync: { state: 'synced', at: now() }, selection: { selectedId } })
  } else {
    const error = worktreesResult.reason
    const code =
      typeof error === 'object' && error !== null && 'code' in error
        ? String((error as { code: unknown }).code)
        : 'unknown'
    const message = error instanceof Error ? error.message : String(error)
    store.update({ sync: { state: 'error', code, message } })
  }

  if (reposResult.status === 'fulfilled') {
    store.dispatchRepos({ type: 'set-list', list: reposResult.value })
  }
}
