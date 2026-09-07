import { resolveBaseRef } from '../domain/worktree-graph/resolve-base-ref'
import type { WorktreeId } from '../domain/worktree-graph/types'
import type { RuntimeGateway } from './ports/runtime-gateway'
import type { SceneStore } from './scene-store'
import { railErrorMessageFor } from './diff-live-loader'

/** Only the methods compare mode needs — narrow like diff-live-loader.ts's own gateway port. */
export type CompareLiveLoaderGatewayPort = Pick<
  RuntimeGateway,
  'gitBranchCompare' | 'gitBranchDiff'
>

export type CompareLiveLoaderDeps = {
  store: SceneStore
  gateway: CompareLiveLoaderGatewayPort
}

export type CompareLiveLoader = {
  /** Kicks off one gitBranchCompare per litter member, concurrently — one child's failure
   *  never blocks the others (continue-on-error). */
  start(members: readonly WorktreeId[]): void
  select(childId: WorktreeId, path: string): void
  stop(): void
  rebindGateway(gateway: CompareLiveLoaderGatewayPort): void
}

type CompareRef = { mergeBase: string; headOid: string }

/**
 * Mirrors diff-live-loader.ts, fanned out over every litter member instead of one focused node:
 * resolveBaseRef + gitBranchCompare per child -> child-rail-loaded/child-rail-error, and
 * gitBranchDiff on select -> child-panel-loaded/child-panel-error. Every dispatch re-checks the
 * store post-await, keyed by childId, so a stopped loader or a closed/reopened compare view never
 * clobbers newer state with a stale resolution.
 */
export function createCompareLiveLoader(deps: CompareLiveLoaderDeps): CompareLiveLoader {
  let gateway = deps.gateway
  let stopped = true

  function dispatch(action: Parameters<SceneStore['dispatchCompareView']>[0]): void {
    if (stopped) return
    deps.store.dispatchCompareView(action)
  }

  function isLiveMember(childId: WorktreeId): boolean {
    const slice = deps.store.get().compareView
    return slice.view === 'open' && childId in slice.childLoads
  }

  async function loadChildRail(childId: WorktreeId): Promise<void> {
    const baseRef = resolveBaseRef(deps.store.get().graph, childId)
    if (baseRef === null) {
      dispatch({ type: 'child-rail-error', childId, message: `no base ref for ${childId}` })
      return
    }
    try {
      const compare = await gateway.gitBranchCompare(childId, baseRef)
      if (stopped || !isLiveMember(childId)) return // stale — stopped or compare view changed mid-flight
      if (compare.status !== 'ready') {
        dispatch({
          type: 'child-rail-error',
          childId,
          message: railErrorMessageFor(compare.status)
        })
        return
      }
      dispatch({
        type: 'child-rail-loaded',
        childId,
        compare: { headOid: compare.headOid, mergeBase: compare.mergeBase },
        files: compare.entries.map((entry) => ({
          path: entry.path,
          status: entry.status,
          added: entry.added,
          removed: entry.removed
        }))
      })
    } catch (error) {
      if (stopped || !isLiveMember(childId)) return
      dispatch({ type: 'child-rail-error', childId, message: messageOf(error) })
    }
  }

  function selectedPathOf(childId: WorktreeId): string | null {
    const slice = deps.store.get().compareView
    return slice.view === 'open' ? (slice.childLoads[childId]?.selectedPath ?? null) : null
  }

  async function loadChildPanel(
    childId: WorktreeId,
    path: string,
    compare: CompareRef
  ): Promise<void> {
    try {
      const content = await gateway.gitBranchDiff(childId, compare, path)
      if (stopped || selectedPathOf(childId) !== path) return
      dispatch({ type: 'child-panel-loaded', childId, path, content })
    } catch (error) {
      if (stopped || selectedPathOf(childId) !== path) return
      dispatch({ type: 'child-panel-error', childId, path, message: messageOf(error) })
    }
  }

  return {
    start(members) {
      stopped = false
      for (const childId of members) {
        void loadChildRail(childId)
      }
    },
    select(childId, path) {
      const slice = deps.store.get().compareView
      const load = slice.view === 'open' ? slice.childLoads[childId] : undefined
      if (!load || load.compare === null) return // that child's rail not loaded yet — no-op
      const compare = load.compare
      dispatch({ type: 'select-file', childId, path })
      void loadChildPanel(childId, path, compare)
    },
    stop() {
      stopped = true
    },
    rebindGateway(newGateway) {
      gateway = newGateway
    }
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
