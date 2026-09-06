import type { AgentStatus } from '../domain/worktree-graph/node-activity'
import type { WorktreeId } from '../domain/worktree-graph/types'
import type { FanOutBatchEntry } from './fan-out-model'
import {
  fanOutMemberIds,
  isFailedDispatch,
  mapDispatchStateToAgentStatus,
  mapPsStatusToAgentStatus
} from './fan-out-model'
import type { RuntimeGateway, WorkerDispatchStateRow } from './ports/runtime-gateway'
import type { SceneStore } from './scene-store'

export const CAMADA_POLL_INTERVAL_MS = 1500

/** Only the methods the camada poll needs — narrow like the other controller ports. */
export type CamadaPollGatewayPort = Pick<
  RuntimeGateway,
  'listWorktreePs' | 'orchestrationWorkerList'
>

export type CamadaMemberPollDeps = {
  gateway: CamadaPollGatewayPort
  store: SceneStore
  setTimer?: (fn: () => void, ms: number) => unknown
  clearTimer?: (handle: unknown) => void
}

export type CamadaMemberPoll = {
  start(): void
  stop(): void
  rebindGateway(gateway: CamadaPollGatewayPort): void
}

/**
 * Drives a dual-source poll on a chained-`setTimeout` loop (never `setInterval`, mirroring
 * live-worktree-sync.ts) while `fanOut.view === 'running'`: `orchestration.workerList` scoped
 * to `runId` when the batch has a lease Run (Change B), else the v1 `worktree.ps` fallback.
 * Dispatches `member-status`/`child-failed` for every fan-out member. Self-halts scheduling —
 * no gateway call and no next tick — the moment the slice isn't (or stops being) `running`, so
 * the owning controller drives start/stop at the fan-out submit/cancel lifecycle rather than
 * this loop polling forever regardless of state.
 */
export function createCamadaMemberPoll(deps: CamadaMemberPollDeps): CamadaMemberPoll {
  const setTimer = deps.setTimer ?? ((fn: () => void, ms: number) => setTimeout(fn, ms))
  const clearTimer =
    deps.clearTimer ?? ((handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>))

  let gateway = deps.gateway
  let stopped = true
  let timerHandle: unknown = null

  function clearPendingTimer(): void {
    if (timerHandle !== null) {
      clearTimer(timerHandle)
      timerHandle = null
    }
  }

  function scheduleNextTick(): void {
    if (stopped) return
    timerHandle = setTimer(() => {
      timerHandle = null
      tick()
    }, CAMADA_POLL_INTERVAL_MS)
  }

  function tick(): void {
    if (stopped) return
    if (deps.store.get().fanOut.view !== 'running') return // self-halt: no gateway call, no schedule
    void pollOnce()
  }

  async function pollOnce(): Promise<void> {
    const slice = deps.store.get().fanOut
    if (slice.view !== 'running') return
    if (slice.runId !== null) {
      await pollWorkerList(slice.runId)
    } else {
      await pollWorktreePs()
    }
  }

  /** v1 fallback (no lease Run backing this batch): unchanged worktree.ps path. */
  async function pollWorktreePs(): Promise<void> {
    const rows = await gateway.listWorktreePs()
    if (stopped) return
    const slice = deps.store.get().fanOut
    if (slice.view !== 'running') return // left running mid-flight — halt, no dispatch, no schedule

    const memberIds = new Set<WorktreeId>(fanOutMemberIds(slice))
    const statusByWorktree: Record<WorktreeId, AgentStatus> = {}
    for (const row of rows) {
      if (!memberIds.has(row.worktreeId)) continue
      statusByWorktree[row.worktreeId] = mapPsStatusToAgentStatus(row.status)
    }
    for (const [worktreeId, status] of Object.entries(statusByWorktree)) {
      deps.store.dispatchFanOut({ type: 'member-status', worktreeId, status })
    }
    scheduleNextTick()
  }

  /** Lease Run backing this batch (Change B): real orchestration tracking. A transient RPC
   *  failure is loss-of-contact, not process death — the loop must still schedule its next tick. */
  async function pollWorkerList(runId: string): Promise<void> {
    let rows: readonly WorkerDispatchStateRow[]
    try {
      rows = (await gateway.orchestrationWorkerList({ run: runId })).workers
    } catch {
      scheduleNextTick()
      return
    }
    if (stopped) return
    const slice = deps.store.get().fanOut
    if (slice.view !== 'running') return // left running mid-flight — halt, no dispatch, no schedule

    const entryByDispatchId = new Map<string, FanOutBatchEntry>()
    for (const entry of slice.batch) {
      if (entry.dispatchId !== null && entry.worktreeId !== null) {
        entryByDispatchId.set(entry.dispatchId, entry)
      }
    }
    for (const row of rows) {
      const entry = entryByDispatchId.get(row.dispatchId)
      if (!entry || entry.worktreeId === null) continue
      if (isFailedDispatch(row)) {
        deps.store.dispatchFanOut({ type: 'child-failed', mutationId: entry.mutationId })
      } else {
        deps.store.dispatchFanOut({
          type: 'member-status',
          worktreeId: entry.worktreeId,
          status: mapDispatchStateToAgentStatus(row.workerState)
        })
      }
    }
    scheduleNextTick()
  }

  return {
    start() {
      if (!stopped) return
      stopped = false
      tick()
    },
    stop() {
      stopped = true
      clearPendingTimer()
    },
    rebindGateway(newGateway) {
      gateway = newGateway
    }
  }
}
