import { fetchBranchCompareEntries } from './branch-compare-entries-fetch'
import type { BranchCompareEntriesGateway } from './branch-compare-entries-fetch'
import type { WorktreeId } from '../domain/worktree-graph/types'
import type { GitStatusRow } from './ports/runtime-gateway'
import type { SceneStore } from './scene-store'

export const SYSTEM_FILE_DIFF_REFRESH_INTERVAL_MS = 10_000

export type SystemFileDiffCacheDeps = {
  store: SceneStore
  gateway: BranchCompareEntriesGateway
  now?: () => number
}

export type SystemFileDiffCache = {
  /** Synchronous — returns the last known entries (or null), kicking a background refresh
   *  when the worktree/key changed or the cadence interval elapsed. Never awaits the fetch. */
  entriesFor(worktree: WorktreeId, fileSetKey: string): readonly GitStatusRow[] | null
  /** Discards in-flight work and cached entries; the cache stays usable for the next open. */
  stop(): void
  rebindGateway(gateway: BranchCompareEntriesGateway): void
}

/**
 * Throttles the system-view branch-compare fetch behind a 10s cadence plus file-set-key change
 * detection, so the 1.5s snapshot-poll tick doesn't call `gitBranchCompare` every tick.
 */
export function createSystemFileDiffCache(deps: SystemFileDiffCacheDeps): SystemFileDiffCache {
  const now = deps.now ?? (() => Date.now())
  let gateway = deps.gateway
  let entries: readonly GitStatusRow[] | null = null
  let lastWorktree: WorktreeId | null = null
  let lastKey: string | null = null
  let lastFetchAt = 0
  let inFlight = false
  // Why: a worktree switch or stop() must discard whatever fetch is still in flight — otherwise
  // the previous worktree's numbers land on the new one. Each refresh owns a generation.
  let generation = 0

  function invalidate(): void {
    generation += 1
    inFlight = false
    entries = null
    lastWorktree = null
    lastKey = null
    lastFetchAt = 0
  }

  function refresh(worktree: WorktreeId, key: string): void {
    const owned = ++generation
    inFlight = true
    void fetchBranchCompareEntries(gateway, deps.store.get().graph, worktree).then((result) => {
      if (owned !== generation) return
      entries = result.outcome === 'ready' ? result.entries : null
      lastFetchAt = now()
      lastKey = key
      inFlight = false
    })
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
