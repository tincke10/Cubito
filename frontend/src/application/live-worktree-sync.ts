import { RECONNECT_MAX_ATTEMPTS, isRetryableFailure, reconnectDelayMs } from './reconnect-backoff'
import { connectionFailureReason } from './connection-reason'
import { syncWorktreeGraph } from './sync-worktree-graph'
import type { SceneStore } from './scene-store'
import type { RuntimeGateway } from './ports/runtime-gateway'
import type { TerminalStreamPort } from './ports/terminal-stream-port'

/** Poll loop owns its own timer (D5) — `main.ts` only composes and calls `start()`. */
export const LIVE_SYNC_POLL_INTERVAL_MS = 2000
export const LIVE_SYNC_JITTER_RATIO = 0.1

/**
 * Design-gap resolution (option a, tasks P5.6/P6.2): `OrcadConnection` carries a mutable
 * `runtimeId`, populated by the gateway's `onRuntimeId` callback once the first RPC resolves.
 * `connect-orcad.ts` (P6.2) is expected to satisfy this shape structurally.
 */
export type LiveSyncConnection = {
  gateway: RuntimeGateway
  terminals: TerminalStreamPort
  runtimeId?: string
  close(): void
  onClose(cb: (reason: string) => void): void
}

export type LiveSyncDeps = {
  connect: () => Promise<LiveSyncConnection>
  store: SceneStore
  now?: () => number
  random?: () => number
  setTimer?: (fn: () => void, ms: number) => unknown
  clearTimer?: (handle: unknown) => void
  isDocumentHidden?: () => boolean
  onVisibilityChange?: (cb: () => void) => () => void
  /** Fires with the fresh connection right after each successful connect (area 7): lets the
   * terminal layer re-subscribe active sessions on the new port. live-worktree-sync stays the
   * sole owner of connection lifecycle — this is a notification, not a delegation. */
  onConnected?(connection: LiveSyncConnection): void
  /** Fires once per connection loss, before any reconnect/backoff decision. */
  onDisconnected?(): void
}

export type LiveWorktreeSync = { start(): void; stop(): void }

/**
 * Drives `syncWorktreeGraph` on a chained-`setTimeout` loop (never `setInterval` — the chain
 * itself is the in-flight guard) and reflects connection lifecycle into the scene store: the
 * `connecting -> connected{runtimeId}` flip waits for the FIRST successful poll to also report a
 * `runtimeId`, transport loss drives `reconnecting{attempt,nextRetryInMs}` via reconnect-backoff,
 * and RPC-only failures (socket alive) are left to `syncWorktreeGraph`'s own `sync.error` — no
 * backoff there, polling continues at the normal interval (D4).
 */
export function createLiveWorktreeSync(
  deps: LiveSyncDeps,
  options?: { pollIntervalMs?: number }
): LiveWorktreeSync {
  const pollIntervalMs = options?.pollIntervalMs ?? LIVE_SYNC_POLL_INTERVAL_MS
  const now = deps.now ?? Date.now
  const random = deps.random ?? Math.random
  const setTimer = deps.setTimer ?? ((fn: () => void, ms: number) => setTimeout(fn, ms))
  const clearTimer =
    deps.clearTimer ?? ((handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>))
  const isDocumentHidden = deps.isDocumentHidden ?? (() => false)
  const onVisibilityChange = deps.onVisibilityChange ?? (() => () => {})

  let stopped = true
  let timerHandle: unknown = null
  let connection: LiveSyncConnection | null = null
  let firstPollSucceeded = false
  let reconnectAttempt = 0
  let unsubscribeVisibility: (() => void) | null = null

  function clearPendingTimer(): void {
    if (timerHandle !== null) {
      clearTimer(timerHandle)
      timerHandle = null
    }
  }

  function scheduleNextPoll(): void {
    if (stopped || isDocumentHidden()) return // paused; resumes only via onVisibilityChange
    const jitterFactor = 1 - LIVE_SYNC_JITTER_RATIO + random() * (LIVE_SYNC_JITTER_RATIO * 2)
    timerHandle = setTimer(() => {
      timerHandle = null
      // Hidden may have flipped true after this timer was scheduled but before it fired —
      // re-check at fire time so an in-flight timer can't sneak a poll in while paused.
      if (stopped || isDocumentHidden()) return
      void poll()
    }, pollIntervalMs * jitterFactor)
  }

  async function poll(): Promise<void> {
    timerHandle = null
    const active = connection
    if (stopped || !active) return
    await syncWorktreeGraph(active.gateway, deps.store, now)
    if (stopped || connection !== active) return
    if (!firstPollSucceeded && deps.store.get().sync.state === 'synced' && active.runtimeId) {
      firstPollSucceeded = true
      reconnectAttempt = 0
      deps.store.update({ connection: { state: 'connected', runtimeId: active.runtimeId } })
    }
    scheduleNextPoll()
  }

  function handleConnectionLost(code: string): void {
    clearPendingTimer()
    connection = null
    firstPollSucceeded = false
    deps.onDisconnected?.()
    if (stopped) return
    if (!isRetryableFailure(code) || reconnectAttempt >= RECONNECT_MAX_ATTEMPTS) {
      deps.store.update({ connection: { state: 'down', reason: connectionFailureReason(code) } })
      return
    }
    reconnectAttempt += 1
    const delay = reconnectDelayMs(reconnectAttempt, random)
    deps.store.update({
      connection: { state: 'reconnecting', attempt: reconnectAttempt, nextRetryInMs: delay }
    })
    timerHandle = setTimer(() => {
      timerHandle = null
      void connectAndPoll()
    }, delay)
  }

  async function connectAndPoll(): Promise<void> {
    if (stopped) return
    deps.store.update({ connection: { state: 'connecting' } })
    try {
      const nextConnection = await deps.connect()
      if (stopped) {
        nextConnection.close()
        return
      }
      connection = nextConnection
      firstPollSucceeded = false
      deps.onConnected?.(nextConnection)
      nextConnection.onClose((reason) => {
        if (connection !== nextConnection) return
        handleConnectionLost(reason)
      })
      await poll()
    } catch (error) {
      const code =
        typeof error === 'object' && error !== null && 'code' in error
          ? String((error as { code: unknown }).code)
          : 'remote_runtime_unavailable'
      handleConnectionLost(code)
    }
  }

  function handleVisible(): void {
    if (stopped) return
    reconnectAttempt = 0
    clearPendingTimer()
    if (connection) {
      void poll()
    } else {
      void connectAndPoll()
    }
  }

  return {
    start() {
      if (!stopped) return
      stopped = false
      unsubscribeVisibility = onVisibilityChange(() => {
        if (!isDocumentHidden()) handleVisible()
      })
      void connectAndPoll()
    },
    stop() {
      stopped = true
      clearPendingTimer()
      unsubscribeVisibility?.()
      unsubscribeVisibility = null
      connection?.close()
      connection = null
    }
  }
}
