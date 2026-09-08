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

export type SystemGraphPublisher = {
  publish(worktree: WorktreeId, snapshot: SystemGraphSnapshot): void
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

  function render(worktree: WorktreeId, snapshot: SystemGraphSnapshot): void {
    const base = mapSnapshotToSystemGraph(snapshot)
    const rows = fileDiff.entriesFor(worktree, systemGraphFileSetKey(base))
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
        render(lastWorktree, lastSnapshot)
      }
    })

  return {
    publish(worktree, snapshot) {
      stopped = false // a fresh publish() resumes a previously-stopped publisher (worktree switch)
      lastWorktree = worktree
      lastSnapshot = snapshot
      render(worktree, snapshot)
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
