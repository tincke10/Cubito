import { buildWorktreeGraph } from '../domain/worktree-graph/build-graph'
import { reconcileSelection } from '../presentation/navigation/selection-model'
import { composeFanOutGraph } from './fan-out-model'
import { applyPsStatusToGraph } from './worktree-ps-status-overlay'
import type { SceneStore } from './scene-store'
import type { RuntimeGateway } from './ports/runtime-gateway'
import { describeFailure } from './i18n/user-facing-error'

/** The slice of RuntimeGateway one sync cycle needs. */
export type SyncGatewayPort = Pick<RuntimeGateway, 'listWorktrees' | 'listRepos' | 'listWorktreePs'>

/**
 * Use case: refresh the worktree graph from the runtime. On failure the
 * previous graph is kept — a stale scene beats an empty one. Selection is
 * reconciled against the freshly built graph so it survives every sync.
 * `repo.list` rides the same cycle but is best-effort: a failure keeps the
 * prior repos slice and never clears the graph (design Area 3). `worktree.ps` is likewise
 * best-effort: on failure nodes keep their previous agentStatus.
 */
export async function syncWorktreeGraph(
  gateway: SyncGatewayPort,
  store: SceneStore,
  now: () => number = Date.now
): Promise<void> {
  // Why: flipping error -> syncing -> error every poll would flash the HUD failure notice.
  if (store.get().sync.state !== 'error') store.update({ sync: { state: 'syncing' } })
  const [worktreesResult, reposResult, psResult] = await Promise.allSettled([
    gateway.listWorktrees(),
    gateway.listRepos(),
    gateway.listWorktreePs()
  ])

  if (worktreesResult.status === 'fulfilled') {
    const withStatus = applyPsStatusToGraph(
      buildWorktreeGraph(worktreesResult.value),
      psResult.status === 'fulfilled' ? psResult.value : null,
      store.get().graph
    )
    const graph = composeFanOutGraph(withStatus, store.get().fanOut)
    const selectedId = reconcileSelection(
      graph,
      store.get().selection.selectedId,
      store.get().repos.activeRepoId
    )
    store.update({ graph, sync: { state: 'synced', at: now() }, selection: { selectedId } })
  } else {
    const error = worktreesResult.reason
    const code =
      typeof error === 'object' && error !== null && 'code' in error
        ? String((error as { code: unknown }).code)
        : 'unknown'
    const message = describeFailure('worktreeSync', error)
    store.update({ sync: { state: 'error', code, message } })
  }

  if (reposResult.status === 'fulfilled') {
    store.dispatchRepos({ type: 'set-list', list: reposResult.value })
  }
}
