import type { FsChangeEvent } from '../../shared/filesystem-entry-types'
import {
  WATCH_BATCH_MAX_WAIT_MS,
  WATCH_BATCH_TRAILING_MS
} from '../../shared/filesystem-watch-batch-window'
import { MAX_BATCHED_WATCHER_EVENTS } from '../ipc/filesystem-watcher-event-batch'

/** Debounces watcher events into one full-worktree rebuild (no incremental AST diffing);
 * overflow — by kind or batch size — skips the debounce and rebuilds immediately. */
export function createSystemGraphWatchScheduler(rebuild: () => void): {
  push(events: FsChangeEvent[]): void
  dispose(): void
} {
  let pendingCount = 0
  let firstPendingAt = 0
  let timer: ReturnType<typeof setTimeout> | null = null

  const clearTimer = (): void => {
    if (!timer) {
      return
    }
    clearTimeout(timer)
    timer = null
  }

  const reset = (): void => {
    clearTimer()
    pendingCount = 0
    firstPendingAt = 0
  }

  const runRebuild = (): void => {
    reset()
    rebuild()
  }

  return {
    push(events: FsChangeEvent[]): void {
      if (events.length === 0) {
        return
      }
      const hasOverflow = events.some((event) => event.kind === 'overflow')
      if (hasOverflow || pendingCount + events.length > MAX_BATCHED_WATCHER_EVENTS) {
        runRebuild()
        return
      }

      pendingCount += events.length
      const now = Date.now()
      if (firstPendingAt === 0) {
        firstPendingAt = now
      }
      if (now - firstPendingAt >= WATCH_BATCH_MAX_WAIT_MS) {
        runRebuild()
        return
      }

      clearTimer()
      timer = setTimeout(runRebuild, WATCH_BATCH_TRAILING_MS)
      if (typeof timer.unref === 'function') {
        timer.unref()
      }
    },
    dispose: reset
  }
}
