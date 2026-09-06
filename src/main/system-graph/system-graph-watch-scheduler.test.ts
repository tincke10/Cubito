import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FsChangeEvent } from '../../shared/filesystem-entry-types'
import {
  WATCH_BATCH_MAX_WAIT_MS,
  WATCH_BATCH_TRAILING_MS
} from '../../shared/filesystem-watch-batch-window'
import { MAX_BATCHED_WATCHER_EVENTS } from '../ipc/filesystem-watcher-event-batch'
import { createSystemGraphWatchScheduler } from './system-graph-watch-scheduler'

const updateEvent: FsChangeEvent = { kind: 'update', absolutePath: '/repo/file.ts' }

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('createSystemGraphWatchScheduler', () => {
  it('does not rebuild before the trailing window elapses', () => {
    const rebuild = vi.fn()
    const scheduler = createSystemGraphWatchScheduler(rebuild)

    scheduler.push([updateEvent])
    vi.advanceTimersByTime(WATCH_BATCH_TRAILING_MS - 1)

    expect(rebuild).not.toHaveBeenCalled()
  })

  it('coalesces a burst of pushes into a single rebuild after the trailing debounce', () => {
    const rebuild = vi.fn()
    const scheduler = createSystemGraphWatchScheduler(rebuild)

    scheduler.push([updateEvent])
    vi.advanceTimersByTime(WATCH_BATCH_TRAILING_MS / 2)
    scheduler.push([updateEvent])
    vi.advanceTimersByTime(WATCH_BATCH_TRAILING_MS)

    expect(rebuild).toHaveBeenCalledTimes(1)
  })

  it('forces a rebuild once the hard cap wait is exceeded even under continuous pushes', () => {
    const rebuild = vi.fn()
    const scheduler = createSystemGraphWatchScheduler(rebuild)

    // Why: push every 100ms (< trailing 150ms) so the trailing timer keeps resetting
    // and never fires on its own — only the 500ms hard cap can trigger the rebuild.
    const step = 100
    scheduler.push([updateEvent])
    for (let elapsed = step; elapsed <= WATCH_BATCH_MAX_WAIT_MS; elapsed += step) {
      vi.advanceTimersByTime(step)
      scheduler.push([updateEvent])
    }

    expect(rebuild).toHaveBeenCalledTimes(1)
  })

  it('collapses an overflow event into an immediate rebuild without waiting for the timer', () => {
    const rebuild = vi.fn()
    const scheduler = createSystemGraphWatchScheduler(rebuild)

    scheduler.push([{ kind: 'overflow', absolutePath: '/repo' }])

    expect(rebuild).toHaveBeenCalledTimes(1)
  })

  it('collapses a batch exceeding the max batched event count into an immediate rebuild', () => {
    const rebuild = vi.fn()
    const scheduler = createSystemGraphWatchScheduler(rebuild)
    const burst = Array.from({ length: MAX_BATCHED_WATCHER_EVENTS + 1 }, () => updateEvent)

    scheduler.push(burst)

    expect(rebuild).toHaveBeenCalledTimes(1)
  })

  it('cancels a pending debounce timer on dispose', () => {
    const rebuild = vi.fn()
    const scheduler = createSystemGraphWatchScheduler(rebuild)

    scheduler.push([updateEvent])
    scheduler.dispose()
    vi.advanceTimersByTime(WATCH_BATCH_MAX_WAIT_MS)

    expect(rebuild).not.toHaveBeenCalled()
  })

  it('is idempotent when disposed twice', () => {
    const scheduler = createSystemGraphWatchScheduler(vi.fn())

    expect(() => {
      scheduler.dispose()
      scheduler.dispose()
    }).not.toThrow()
  })

  it('ignores an empty push', () => {
    const rebuild = vi.fn()
    const scheduler = createSystemGraphWatchScheduler(rebuild)

    scheduler.push([])
    vi.advanceTimersByTime(WATCH_BATCH_MAX_WAIT_MS)

    expect(rebuild).not.toHaveBeenCalled()
  })
})
