import { mapSnapshotToSystemGraph } from './system-snapshot-to-graph'
import { applyFileDiffToSystemGraph, systemGraphFileSetKey } from './system-graph-file-diff'
import { createSystemFileDiffCache } from './system-file-diff-cache'
import type { SystemFileDiffCache } from './system-file-diff-cache'
import { RpcCallError } from '../infrastructure/rpc/rpc-connection'
import type { RuntimeGateway } from './ports/runtime-gateway'
import type { SceneStore } from './scene-store'

export const SYSTEM_SNAPSHOT_POLL_INTERVAL_MS = 1500

/** Only the methods the snapshot poll needs — narrow like the other controller ports. */
export type SystemSnapshotPollGatewayPort = Pick<
  RuntimeGateway,
  'systemSnapshot' | 'gitBranchCompare'
>

export type SystemSnapshotPollDeps = {
  store: SceneStore
  gateway: SystemSnapshotPollGatewayPort
  /** Fires once, then stops polling — the caller falls back to the scripted stub driver. */
  onUnsupported: () => void
  setTimer?: (fn: () => void, ms: number) => unknown
  clearTimer?: (handle: unknown) => void
  /** Throttled branch-compare source for the file-level diff join — override in tests. */
  fileDiff?: SystemFileDiffCache
}

export type SystemSnapshotPoll = {
  start(worktree: string): void
  stop(): void
  rebindGateway(gateway: SystemSnapshotPollGatewayPort): void
}

/**
 * Drives `systemSnapshot` on a chained-`setTimeout` loop (never `setInterval`, mirroring
 * camada-member-poll.ts) while `systemView.view === 'open'`, replacing the whole graph each
 * tick. `method_not_found` (old host, no `system.snapshot`) halts polling and fires
 * `onUnsupported` once so the binder can fall back to the scripted demo; any other error is
 * treated as transient — keep the last graph, retry on the next tick.
 */
export function createSystemSnapshotPoll(deps: SystemSnapshotPollDeps): SystemSnapshotPoll {
  const setTimer = deps.setTimer ?? ((fn: () => void, ms: number) => setTimeout(fn, ms))
  const clearTimer =
    deps.clearTimer ?? ((handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>))

  let gateway = deps.gateway
  const fileDiff = deps.fileDiff ?? createSystemFileDiffCache({ store: deps.store, gateway })
  let stopped = true
  let timerHandle: unknown = null

  function clearPendingTimer(): void {
    if (timerHandle !== null) {
      clearTimer(timerHandle)
      timerHandle = null
    }
  }

  function scheduleNextTick(worktree: string): void {
    if (stopped) return
    timerHandle = setTimer(() => {
      timerHandle = null
      tick(worktree)
    }, SYSTEM_SNAPSHOT_POLL_INTERVAL_MS)
  }

  function tick(worktree: string): void {
    if (stopped) return
    if (deps.store.get().systemView.view !== 'open') return // self-halt: no gateway call, no schedule
    void pollOnce(worktree)
  }

  async function pollOnce(worktree: string): Promise<void> {
    try {
      const snapshot = await gateway.systemSnapshot(worktree)
      if (stopped) return
      if (deps.store.get().systemView.view !== 'open') return // left open mid-flight — no dispatch, no schedule
      const base = mapSnapshotToSystemGraph(snapshot)
      const rows = fileDiff.entriesFor(worktree, systemGraphFileSetKey(base))
      const graph = rows === null ? base : applyFileDiffToSystemGraph(base, rows).graph
      deps.store.dispatchSystemView({ type: 'replace-graph', graph })
      scheduleNextTick(worktree)
    } catch (error) {
      if (stopped) return
      if (deps.store.get().systemView.view !== 'open') return
      if (error instanceof RpcCallError && error.code === 'method_not_found') {
        stopped = true
        deps.onUnsupported()
        return
      }
      scheduleNextTick(worktree) // transient error — keep last graph, retry
    }
  }

  return {
    start(worktree) {
      if (!stopped) return
      stopped = false
      deps.store.dispatchSystemView({ type: 'open', nodeId: worktree }) // harmless re-dispatch if already open
      tick(worktree)
    },
    stop() {
      stopped = true
      clearPendingTimer()
      fileDiff.stop()
    },
    rebindGateway(newGateway) {
      gateway = newGateway
      fileDiff.rebindGateway(newGateway)
    }
  }
}
