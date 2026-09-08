import { fetchBranchCompareEntries } from './branch-compare-entries-fetch'
import { fetchWorkingTreeEntries } from './working-tree-entries-fetch'
import { mergeFileDiffEntries } from './system-graph-file-diff'
import type { WorktreeId } from '../domain/worktree-graph/types'
import type { GitStatusRow, RuntimeGateway } from './ports/runtime-gateway'
import type { SceneStore } from './scene-store'

export const SYSTEM_FILE_DIFF_REFRESH_INTERVAL_MS = 10_000
/** Matches the 1.5s poll/member-poll cadence (camada-member-poll.ts, system-snapshot-poll.ts). */
export const SYSTEM_FILE_DIFF_STREAM_MIN_INTERVAL_MS = 1_500

/** Only the methods a file-diff refresh needs — branch-compare plus working-tree status. */
export type SystemFileDiffGateway = Pick<RuntimeGateway, 'gitBranchCompare' | 'gitStatus'>

export type SystemFileDiffCacheDeps = {
  store: SceneStore
  gateway: SystemFileDiffGateway
  now?: () => number
  /** Fires once a background refresh lands fresh rows (generation-guarded — never for a
   *  superseded worktree/key). Lets a publisher re-render without waiting for the next tick. */
  onEntries?: () => void
  setTimer?: (fn: () => void, ms: number) => unknown
  clearTimer?: (handle: unknown) => void
}

export type SystemFileDiffCache = {
  /** Synchronous — returns the last known entries (or null), kicking a background refresh
   *  when the worktree/key changed or the cadence interval elapsed. Never awaits the fetch. */
  entriesFor(worktree: WorktreeId, fileSetKey: string): readonly GitStatusRow[] | null
  /** Leading+trailing throttled immediate refresh for a stream frame (Change item 3): the first
   *  call in a window refreshes now, later calls in the same window coalesce into one trailing
   *  refresh when it closes. No-ops on a worktree not yet known to `entriesFor` — that call's
   *  own switch-detection covers the fetch instead of racing it. */
  refreshNow(worktree: WorktreeId, fileSetKey: string): void
  /** Discards in-flight work and cached entries; the cache stays usable for the next open. */
  stop(): void
  rebindGateway(gateway: SystemFileDiffGateway): void
}

/**
 * Throttles the system-view branch-compare fetch behind a 10s cadence plus file-set-key change
 * detection, so the 1.5s snapshot-poll tick doesn't call `gitBranchCompare` every tick.
 */
export function createSystemFileDiffCache(deps: SystemFileDiffCacheDeps): SystemFileDiffCache {
  const now = deps.now ?? (() => Date.now())
  const setTimer = deps.setTimer ?? ((fn: () => void, ms: number) => setTimeout(fn, ms))
  const clearTimer =
    deps.clearTimer ?? ((handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>))
  let gateway = deps.gateway
  let entries: readonly GitStatusRow[] | null = null
  let lastWorktree: WorktreeId | null = null
  let lastKey: string | null = null
  let lastFetchAt = 0
  let inFlight = false
  // Why: a worktree switch or stop() must discard whatever fetch is still in flight — otherwise
  // the previous worktree's numbers land on the new one. Each refresh owns a generation.
  let generation = 0

  // refreshNow's own leading+trailing throttle state — independent of the cadence above.
  let lastStreamRefreshAt = -Infinity
  let streamTimerHandle: unknown = null
  let pendingStreamArgs: { worktree: WorktreeId; key: string } | null = null

  function clearStreamTimer(): void {
    if (streamTimerHandle !== null) {
      clearTimer(streamTimerHandle)
      streamTimerHandle = null
    }
    pendingStreamArgs = null
  }

  function invalidate(): void {
    generation += 1
    inFlight = false
    entries = null
    lastWorktree = null
    lastKey = null
    lastFetchAt = 0
    clearStreamTimer()
  }

  function refresh(worktree: WorktreeId, key: string): void {
    const owned = ++generation
    inFlight = true
    void Promise.all([
      fetchBranchCompareEntries(gateway, deps.store.get().graph, worktree),
      fetchWorkingTreeEntries(gateway, worktree)
    ]).then(([committedResult, workingResult]) => {
      if (owned !== generation) return
      const committed = committedResult.outcome === 'ready' ? committedResult.entries : null
      const working = workingResult.outcome === 'ready' ? workingResult.entries : null
      entries = mergeFileDiffEntries(committed, working)
      lastFetchAt = now()
      lastKey = key
      inFlight = false
      deps.onEntries?.()
    })
  }

  function fireTrailingRefresh(): void {
    streamTimerHandle = null
    const args = pendingStreamArgs
    pendingStreamArgs = null
    if (args === null) return
    lastStreamRefreshAt = now()
    refresh(args.worktree, args.key)
  }

  return {
    entriesFor(worktree, fileSetKey) {
      if (worktree !== lastWorktree) {
        invalidate()
        lastWorktree = worktree
        refresh(worktree, fileSetKey)
        return entries
      }
      if (inFlight) return entries
      if (fileSetKey !== lastKey) {
        refresh(worktree, fileSetKey)
        return entries
      }
      if (now() - lastFetchAt >= SYSTEM_FILE_DIFF_REFRESH_INTERVAL_MS) {
        refresh(worktree, fileSetKey)
        return entries
      }
      return entries
    },
    refreshNow(worktree, fileSetKey) {
      if (worktree !== lastWorktree) {
        // entriesFor's own switch-detection (called right after, in the same render() pass)
        // already forces a fresh fetch for this worktree — don't race it with a second one.
        clearStreamTimer()
        return
      }
      const elapsed = now() - lastStreamRefreshAt
      if (elapsed >= SYSTEM_FILE_DIFF_STREAM_MIN_INTERVAL_MS) {
        lastStreamRefreshAt = now()
        refresh(worktree, fileSetKey)
        return
      }
      pendingStreamArgs = { worktree, key: fileSetKey }
      if (streamTimerHandle !== null) return // trailing already scheduled — just updated its args
      streamTimerHandle = setTimer(
        fireTrailingRefresh,
        SYSTEM_FILE_DIFF_STREAM_MIN_INTERVAL_MS - elapsed
      )
    },
    // Not terminal: the binder keeps one poll (and this cache) across [x] open/close cycles, so
    // stop only discards in-flight work and forces a fresh fetch on the next open.
    stop() {
      invalidate()
    },
    rebindGateway(newGateway) {
      gateway = newGateway
    }
  }
}
