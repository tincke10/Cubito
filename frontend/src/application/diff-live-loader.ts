import { resolveBaseRef } from '../domain/worktree-graph/resolve-base-ref'
import type { WorktreeId } from '../domain/worktree-graph/types'
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

  async function loadRail(nodeId: WorktreeId, baseRef: string): Promise<void> {
    try {
      const compare = await gateway.gitBranchCompare(nodeId, baseRef)
      if (stopped) return
      const slice = deps.store.get().diffView
      if (slice.view !== 'open' || slice.focusedNodeId !== nodeId) return // stale — node changed mid-flight
      dispatch({
        type: 'rail-loaded',
        compare: { headOid: compare.headOid, mergeBase: compare.mergeBase },
        files: compare.entries.map((entry) => ({
          path: entry.path,
          status: entry.status,
          added: entry.added,
          removed: entry.removed
        }))
      })
    } catch (error) {
      if (stopped) return
      const slice = deps.store.get().diffView
      if (slice.view !== 'open' || slice.focusedNodeId !== nodeId) return
      dispatch({ type: 'rail-error', message: messageOf(error) })
    }
  }

  async function loadPanel(
    nodeId: WorktreeId,
    path: string,
    compare: DiffCompareRef
  ): Promise<void> {
    try {
      const content = await gateway.gitBranchDiff(nodeId, compare, path)
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
      void loadRail(nodeId, baseRef)
    },
    select(path) {
      const slice = deps.store.get().diffView
      if (slice.view !== 'open' || slice.compare === null) return // rail not loaded — no-op
      const nodeId = slice.focusedNodeId
      const compare = slice.compare
      dispatch({ type: 'select', path })
      void loadPanel(nodeId, path, compare)
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
