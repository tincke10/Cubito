import type { SceneStore } from './scene-store'
import type { SystemViewAction } from './system-view-model'
import type { SystemGraphPort } from './ports/system-graph-port'

export type SystemArcBeat = { delayMs: number; actions: readonly SystemViewAction[] }

/**
 * Scripted demo arc for the "sistema en vivo" mockup — node ids/labels match the seed graph
 * a `SystemGraphPort` implementation is expected to return for the focused node.
 */
export const SYSTEM_ARC: readonly SystemArcBeat[] = [
  {
    delayMs: 900,
    actions: [
      {
        type: 'append-feed',
        row: { id: 'feed-1', time: '10:32', kind: 'read', text: 'leyó src/routes/auth.ts' }
      }
    ]
  },
  {
    delayMs: 900,
    actions: [
      {
        type: 'append-feed',
        row: {
          id: 'feed-2',
          time: '10:32',
          kind: 'read',
          text: 'leyó src/services/auth.service.ts'
        }
      }
    ]
  },
  {
    delayMs: 1000,
    actions: [
      {
        type: 'apply-delta',
        delta: {
          op: 'set-node-state',
          nodeId: 'POST /auth/retry',
          state: 'editing',
          diff: { added: 18, removed: 6 }
        }
      },
      {
        type: 'apply-delta',
        delta: { op: 'set-edge-kind', from: 'router', to: 'POST /auth/retry', kind: 'flow' }
      },
      { type: 'set-highlight', nodeId: 'POST /auth/retry' },
      {
        type: 'append-feed',
        row: {
          id: 'feed-3',
          time: '10:33',
          kind: 'edit',
          text: 'editando POST /auth/retry',
          highlighted: true
        }
      }
    ]
  },
  {
    delayMs: 1200,
    actions: [
      {
        type: 'apply-delta',
        delta: {
          op: 'add-node',
          node: {
            id: 'POST /auth/refresh',
            kind: 'endpoint',
            label: 'POST /auth/refresh',
            method: 'POST',
            state: 'naciendo',
            diff: { added: 21, removed: 0 },
            note: 'creado por claude'
          }
        }
      },
      {
        type: 'apply-delta',
        delta: { op: 'add-edge', edge: { from: 'router', to: 'POST /auth/refresh', kind: 'flow' } }
      },
      {
        type: 'append-feed',
        row: {
          id: 'feed-4',
          time: '10:34',
          kind: 'create',
          text: 'nuevo endpoint POST /auth/refresh'
        }
      }
    ]
  },
  {
    delayMs: 900,
    actions: [
      {
        type: 'append-feed',
        row: { id: 'feed-5', time: '10:35', kind: 'run', text: 'corrió pnpm test auth.retry' }
      }
    ]
  },
  {
    delayMs: 900,
    actions: [
      {
        type: 'append-feed',
        row: { id: 'feed-6', time: '10:35', kind: 'pass', text: '✓ 8/8 tests verdes' }
      },
      {
        type: 'apply-delta',
        delta: { op: 'set-node-state', nodeId: 'POST /auth/retry', state: 'tested' }
      }
    ]
  },
  {
    delayMs: 900,
    actions: [
      {
        type: 'append-feed',
        row: { id: 'feed-7', time: '10:36', kind: 'diff', text: 'Δ +73 −14 contra main' }
      }
    ]
  }
]

export type SystemLiveDriverDeps = {
  store: SceneStore
  port: SystemGraphPort
  setTimer?: (fn: () => void, ms: number) => unknown
  clearTimer?: (handle: unknown) => void
}

export type SystemLiveDriver = { start(nodeId: string): void; stop(): void }

/**
 * Opens the system view, seeds its graph from the port, then plays `SYSTEM_ARC` beat-by-beat on
 * a chained-`setTimeout` loop (never `setInterval`, mirroring live-worktree-sync.ts). `stop()`
 * only halts the timer — dispatching `close` is the owning controller's call, not this driver's.
 */
export function createSystemLiveDriver(deps: SystemLiveDriverDeps): SystemLiveDriver {
  const setTimer = deps.setTimer ?? ((fn: () => void, ms: number) => setTimeout(fn, ms))
  const clearTimer =
    deps.clearTimer ?? ((handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>))

  let stopped = true
  let timerHandle: unknown = null

  function clearPendingTimer(): void {
    if (timerHandle !== null) {
      clearTimer(timerHandle)
      timerHandle = null
    }
  }

  function dispatch(action: SystemViewAction): void {
    deps.store.dispatchSystemView(action)
  }

  function playBeat(index: number): void {
    if (stopped) return
    const beat = SYSTEM_ARC[index]
    if (!beat) return // arc finished — no further scheduling
    timerHandle = setTimer(() => {
      timerHandle = null
      if (stopped) return
      for (const action of beat.actions) dispatch(action)
      playBeat(index + 1)
    }, beat.delayMs)
  }

  async function seedGraph(nodeId: string): Promise<void> {
    const graph = await deps.port.loadSystemGraph(nodeId)
    if (stopped) return
    for (const node of graph.nodes.values()) {
      dispatch({ type: 'apply-delta', delta: { op: 'add-node', node } })
    }
    for (const edge of graph.edges) {
      dispatch({ type: 'apply-delta', delta: { op: 'add-edge', edge } })
    }
  }

  return {
    start(nodeId) {
      if (!stopped) return
      stopped = false
      dispatch({ type: 'open', nodeId })
      void seedGraph(nodeId).then(() => {
        if (!stopped) playBeat(0)
      })
    },
    stop() {
      stopped = true
      clearPendingTimer()
    }
  }
}
