import { agentActivityToFeedRow } from './agent-activity-to-feed'
import { RpcCallError } from '../infrastructure/rpc/rpc-connection'
import type { RuntimeGateway } from './ports/runtime-gateway'
import type { SceneStore } from './scene-store'

export const AGENT_ACTIVITY_POLL_INTERVAL_MS = 1500
export const AGENT_ACTIVITY_POLL_LIMIT = 50

/** Only the method the activity poll needs — narrow like SystemSnapshotPollGatewayPort. */
export type AgentActivityPollGatewayPort = Pick<RuntimeGateway, 'agentActivity'>

export type AgentActivityPollDeps = {
  store: SceneStore
  gateway: AgentActivityPollGatewayPort
  /** Fires once, then stops polling — mirrors system-snapshot-poll's fallback signal. */
  onUnsupported: () => void
  setTimer?: (fn: () => void, ms: number) => unknown
  clearTimer?: (handle: unknown) => void
}

export type AgentActivityPoll = {
  start(worktree: string): void
  stop(): void
  rebindGateway(gateway: AgentActivityPollGatewayPort): void
}

/**
 * Drives `agentActivity` on a SEPARATE chained-`setTimeout` loop (mirrors
 * system-snapshot-poll.ts) while `systemView.view === 'open'`, tracking a per-worktree seq
 * cursor and dispatching batched feed-row appends. Does NOT dispatch 'open' — the snapshot poll
 * owns that transition; this poll only ever appends to / resets the feed already opened by it.
 */
export function createAgentActivityPoll(deps: AgentActivityPollDeps): AgentActivityPoll {
  const setTimer = deps.setTimer ?? ((fn: () => void, ms: number) => setTimeout(fn, ms))
  const clearTimer =
    deps.clearTimer ?? ((handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>))

  let gateway = deps.gateway
  let stopped = true
  let timerHandle: unknown = null
  let lastWorktree: string | null = null
  let cursor = 0

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
    }, AGENT_ACTIVITY_POLL_INTERVAL_MS)
  }

  function tick(worktree: string): void {
    if (stopped) return
    if (deps.store.get().systemView.view !== 'open') return // self-halt: no gateway call, no schedule
    void pollOnce(worktree)
  }

  async function pollOnce(worktree: string): Promise<void> {
    try {
      const page = await gateway.agentActivity({
        worktree,
        sinceSeq: cursor,
        limit: AGENT_ACTIVITY_POLL_LIMIT
      })
      if (stopped) return
      if (deps.store.get().systemView.view !== 'open') return // left open mid-flight — no dispatch, no schedule
      if (page.latestSeq < cursor) {
        deps.store.dispatchSystemView({ type: 'reset-feed' })
        cursor = 0
      }
      if (page.events.length > 0) {
        deps.store.dispatchSystemView({
          type: 'append-feed-rows',
          rows: page.events.map(agentActivityToFeedRow)
        })
      }
      cursor = Math.max(cursor, page.latestSeq)
      scheduleNextTick(worktree)
    } catch (error) {
      if (stopped) return
      if (deps.store.get().systemView.view !== 'open') return
      if (error instanceof RpcCallError && error.code === 'method_not_found') {
        stopped = true
        deps.onUnsupported()
        return
      }
      scheduleNextTick(worktree) // transient error — keep last feed, retry
    }
  }

  return {
    start(worktree) {
      if (!stopped) return
      stopped = false
      if (worktree !== lastWorktree) {
        cursor = 0
        deps.store.dispatchSystemView({ type: 'reset-feed' })
      }
      lastWorktree = worktree
      tick(worktree)
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
