import { createSystemGraphPublisher } from './system-graph-publish'
import { createSystemSnapshotPoll } from './system-snapshot-poll'
import type { SystemSnapshotPollGatewayPort } from './system-snapshot-poll'
import type { SystemGraphStreamPort } from './ports/system-graph-stream-port'
import type { WorktreeId } from '../domain/worktree-graph/types'
import type { SceneStore } from './scene-store'

export type SystemGraphSourceDeps = {
  store: SceneStore
  gateway: SystemSnapshotPollGatewayPort
  streamPort?: SystemGraphStreamPort
  /** Fires once when the poll itself reports `method_not_found` — the binder starts the
   *  scripted stub driver for this open (mirrors the pre-Wave-F3 fallback). */
  onDemoFallback: () => void
}

export type SystemGraphSourceKind = 'stream' | 'poll' | 'demo'

export type SystemGraphSource = {
  start(worktree: WorktreeId): void
  stop(): void
  rebind(gateway: SystemSnapshotPollGatewayPort, streamPort?: SystemGraphStreamPort): void
  currentSource(): SystemGraphSourceKind
}

type InternalState = 'idle' | 'opening' | 'streaming' | 'polling' | 'demo'

/**
 * Stream-first system-graph source with a poll fallback (design state table): opens
 * `system.watch` when a stream port is bound, falls back to the 1.5s poll on an unsupported or
 * closed stream (no re-subscribe, no backoff — a later `rebind` re-enters fresh), and falls
 * further back to the scripted demo driver (via `onDemoFallback`) when even the poll is
 * unsupported. One shared publisher backs both the stream and the poll so the file-diff join
 * survives switching between them.
 */
export function createSystemGraphSource(deps: SystemGraphSourceDeps): SystemGraphSource {
  let streamPort = deps.streamPort
  let state: InternalState = 'idle'
  let worktree: WorktreeId | null = null
  let subscription: { close(): void } | null = null

  const publisher = createSystemGraphPublisher({ store: deps.store, gateway: deps.gateway })
  const poll = createSystemSnapshotPoll({
    store: deps.store,
    gateway: deps.gateway,
    publisher,
    onUnsupported: () => {
      state = 'demo'
      deps.onDemoFallback()
    }
  })

  function closeSubscription(): void {
    subscription?.close()
    subscription = null
  }

  function startPolling(w: WorktreeId): void {
    state = 'polling'
    poll.start(w)
  }

  function fallBackToPoll(w: WorktreeId): void {
    closeSubscription()
    startPolling(w)
  }

  function openStream(port: SystemGraphStreamPort, w: WorktreeId): void {
    state = 'opening'
    subscription = port.watch(w, {
      onFrame(frame) {
        if (worktree !== w) return // superseded by a later stop()/start()/rebind()
        if (frame.type === 'ready') state = 'streaming'
        publisher.publish(w, frame.snapshot)
      },
      onUnsupported() {
        if (worktree !== w) return
        fallBackToPoll(w)
      },
      onClosed() {
        if (worktree !== w) return
        fallBackToPoll(w)
      }
    })
  }

  function route(w: WorktreeId): void {
    if (streamPort) {
      openStream(streamPort, w)
    } else {
      startPolling(w)
    }
  }

  /** A fresh entry (first open, or a worktree switch) — dispatches 'open' up front (symmetric
   *  with poll.start()'s own re-dispatch, system-snapshot-poll.ts) so a switch resets
   *  focusedNodeId/graph/feed, which the stream path otherwise never touches on its own (a
   *  'ready'/'graph' frame only replaces the graph). NOT used by `rebind` — a reconnect on the
   *  SAME worktree should resume, not flash the graph back to empty. */
  function beginFresh(w: WorktreeId): void {
    deps.store.dispatchSystemView({ type: 'open', nodeId: w })
    route(w)
  }

  function teardown(): void {
    closeSubscription()
    poll.stop() // idempotent even if the poll was never started; also stops the shared publisher
    worktree = null
    state = 'idle'
  }

  return {
    start(w) {
      if (worktree === w && state !== 'idle') return // already running for this worktree
      teardown()
      worktree = w
      beginFresh(w)
    },
    stop() {
      teardown()
    },
    rebind(gateway, nextStreamPort) {
      streamPort = nextStreamPort
      poll.rebindGateway(gateway)
      publisher.rebindGateway(gateway)
      // A per-open fallback to demo is scoped to that open (mirrors the pre-F3 binder comment) —
      // only retry the real path on a fresh open, not while a rebind lands mid-fallback.
      if (worktree === null || state === 'demo') return
      closeSubscription()
      route(worktree)
    },
    currentSource() {
      if (state === 'demo') return 'demo'
      if (state === 'opening' || state === 'streaming') return 'stream'
      return 'poll'
    }
  }
}
