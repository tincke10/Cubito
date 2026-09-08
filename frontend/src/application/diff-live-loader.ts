import { resolveBaseRef } from '../domain/worktree-graph/resolve-base-ref'
import type { WorktreeId } from '../domain/worktree-graph/types'
import { fetchBranchCompareEntries } from './branch-compare-entries-fetch'
import type { RuntimeGateway } from './ports/runtime-gateway'
import type { SceneStore } from './scene-store'

/** Only the methods diff mode needs — narrow like the other controller ports. */
export type DiffLiveLoaderGatewayPort = Pick<RuntimeGateway, 'gitBranchCompare' | 'gitBranchDiff'>

export type DiffLiveLoaderDeps = {
  store: SceneStore
  gateway: DiffLiveLoaderGatewayPort
}

export type DiffLiveLoader = {
  start(nodeId: string): void
  select(path: string): void
  stop(): void
  rebindGateway(gateway: DiffLiveLoaderGatewayPort): void
}

/**
 * Opens diff mode for a node, loads the rail via `gitBranchCompare`, and loads a file's
 * before/after content via `gitBranchDiff` on selection. No scripted arc — real gateway calls,
 * guarded against stale resolutions the way camada-member-poll re-checks the store post-await.
 */
export function createDiffLiveLoader(deps: DiffLiveLoaderDeps): DiffLiveLoader {
  let gateway = deps.gateway
  let stopped = true

  function dispatch(action: Parameters<SceneStore['dispatchDiffView']>[0]): void {
    if (stopped) return
    deps.store.dispatchDiffView(action)
  }

  async function loadRail(nodeId: WorktreeId): Promise<void> {
    const result = await fetchBranchCompareEntries(gateway, deps.store.get().graph, nodeId)
    if (stopped) return
    const slice = deps.store.get().diffView
    if (slice.view !== 'open' || slice.focusedNodeId !== nodeId) return // stale — node changed mid-flight
    switch (result.outcome) {
      case 'ready':
        dispatch({
          type: 'rail-loaded',
          compare: result.compare,
          files: result.entries.map((entry) => ({
            path: entry.path,
            status: entry.status,
            added: entry.added,
            removed: entry.removed,
            ...(entry.oldPath === undefined ? {} : { oldPath: entry.oldPath })
          }))
        })
        return
      case 'not-ready':
        dispatch({ type: 'rail-error', message: railErrorMessageFor(result.status) })
        return
      case 'failed':
        dispatch({ type: 'rail-error', message: result.message })
        return
      case 'no-base-ref':
        return // unreachable — start() already resolved a baseRef before calling loadRail
    }
  }

  async function loadPanel(
    nodeId: WorktreeId,
    path: string,
    compare: DiffCompareRef,
    oldPath: string | undefined
  ): Promise<void> {
    try {
      const content = await gateway.gitBranchDiff(nodeId, compare, path, oldPath)
      if (stopped) return
      const slice = deps.store.get().diffView
      if (slice.view !== 'open' || slice.focusedNodeId !== nodeId || slice.selectedPath !== path)
        return
      dispatch({ type: 'panel-loaded', path, content })
    } catch (error) {
      if (stopped) return
      const slice = deps.store.get().diffView
      if (slice.view !== 'open' || slice.focusedNodeId !== nodeId || slice.selectedPath !== path)
        return
      dispatch({ type: 'panel-error', path, message: messageOf(error) })
    }
  }

  return {
    start(nodeId) {
      stopped = false
      const baseRef = resolveBaseRef(deps.store.get().graph, nodeId)
      if (baseRef === null) {
        dispatch({ type: 'open-error', message: `no base ref for ${nodeId}` })
        return
      }
      dispatch({ type: 'open', nodeId, baseRef })
      void loadRail(nodeId)
    },
    select(path) {
      const slice = deps.store.get().diffView
      if (slice.view !== 'open' || slice.compare === null) return // rail not loaded — no-op
      const nodeId = slice.focusedNodeId
      const compare = slice.compare
      const oldPath = slice.files.find((file) => file.path === path)?.oldPath
      dispatch({ type: 'select', path })
      void loadPanel(nodeId, path, compare, oldPath)
    },
    stop() {
      stopped = true
    },
    rebindGateway(newGateway) {
      gateway = newGateway
    }
  }
}

type DiffCompareRef = { mergeBase: string; headOid: string }

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** Human copy for a non-'ready' BranchCompare status (git.branchCompare doesn't throw for these).
 *  Exported for compare-live-loader.ts (Change D) — reused verbatim, one wording for both modes. */
export function railErrorMessageFor(status: string): string {
  switch (status) {
    case 'invalid-base':
      return 'base inválida'
    case 'unborn-head':
      return 'rama sin commits'
    case 'no-merge-base':
      return 'sin ancestro común con la base'
    default:
      return status
  }
}
