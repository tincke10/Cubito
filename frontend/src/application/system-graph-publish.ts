import { mapSnapshotToSystemGraph } from './system-snapshot-to-graph'
import { applyFileDiffToSystemGraph, systemGraphFileSetKey } from './system-graph-file-diff'
import { createSystemFileDiffCache } from './system-file-diff-cache'
import type { SystemFileDiffCache, SystemFileDiffGateway } from './system-file-diff-cache'
import type { SystemGraphSnapshot } from './ports/runtime-gateway'
import type { WorktreeId } from '../domain/worktree-graph/types'
import type { SceneStore } from './scene-store'

export type SystemGraphPublisherDeps = {
  store: SceneStore
  gateway: SystemFileDiffGateway
  fileDiff?: SystemFileDiffCache
}

/** 'stream' forces an immediate (throttled) file-diff refresh before rendering — the poll's own
 *  10s cadence already keeps numbers fresh, so it stays on the passive 'poll' path (default). */
export type SystemGraphPublishOrigin = 'poll' | 'stream'

export type SystemGraphPublisher = {
  publish(
    worktree: WorktreeId,
    snapshot: SystemGraphSnapshot,
    origin?: SystemGraphPublishOrigin
  ): void
  stop(): void
  rebindGateway(gateway: SystemFileDiffGateway): void
}

/**
 * Shared snapshot->graph publish seam (poll today, stream in Wave F3): joins the throttled
 * file-diff cache into the mapped snapshot and dispatches replace-graph. A stream has no "next
 * tick" to self-heal a null cache read (unlike the 1.5s poll), so this re-renders the last
 * snapshot once the cache's background fetch lands fresh rows — otherwise diff numbers would sit
 * missing until the next unrelated graph rebuild.
 */
export function createSystemGraphPublisher(deps: SystemGraphPublisherDeps): SystemGraphPublisher {
  let stopped = false
  let lastWorktree: WorktreeId | null = null
  let lastSnapshot: SystemGraphSnapshot | null = null

  function render(
    worktree: WorktreeId,
    snapshot: SystemGraphSnapshot,
    origin: SystemGraphPublishOrigin
  ): void {
    const base = mapSnapshotToSystemGraph(snapshot)
    const key = systemGraphFileSetKey(base)
    if (origin === 'stream') fileDiff.refreshNow(worktree, key)
    const rows = fileDiff.entriesFor(worktree, key)
    const graph = rows === null ? base : applyFileDiffToSystemGraph(base, rows).graph
    deps.store.dispatchSystemView({ type: 'replace-graph', graph })
  }

  const fileDiff: SystemFileDiffCache =
    deps.fileDiff ??
    createSystemFileDiffCache({
      store: deps.store,
      gateway: deps.gateway,
      onEntries: () => {
        if (stopped) return
        if (lastWorktree === null || lastSnapshot === null) return
        if (deps.store.get().systemView.view !== 'open') return
        render(lastWorktree, lastSnapshot, 'poll') // just re-reads the now-fresh cache, no forced refetch
      }
    })

  return {
    publish(worktree, snapshot, origin = 'poll') {
      stopped = false // a fresh publish() resumes a previously-stopped publisher (worktree switch)
      lastWorktree = worktree
      lastSnapshot = snapshot
      render(worktree, snapshot, origin)
    },
    stop() {
      stopped = true
      fileDiff.stop()
    },
    rebindGateway(gateway) {
      fileDiff.rebindGateway(gateway)
    }
  }
}
