import { emptyEngineSystemGraph } from '../../../system-graph/system-graph-model'
import { getRuntimeSystemGraphService } from '../../../system-graph/runtime-system-graph-host'
import { serializeSystemGraph } from '../../../system-graph/system-graph-wire'
import type { OrcaRuntimeService } from '../../orca-runtime'

/** Streams `system.watch`: one `ready` frame with the current graph, then one `graph`
 * frame per rebuild notification. No native watcher, batcher, or exit-retry needed here
 * — those live in the debounced fs watch that ensureWatched() arms. */
export async function runSystemGraphWatchStream(args: {
  runtime: OrcaRuntimeService
  worktree: string
  connectionId?: string
  signal?: AbortSignal
  subscriptionId: string
  emit: (event: unknown) => void
}): Promise<void> {
  if (args.signal?.aborted) {
    return
  }
  const service = getRuntimeSystemGraphService(args.runtime)
  const graphFor = () =>
    serializeSystemGraph(service.getGraph(args.worktree) ?? emptyEngineSystemGraph())

  await new Promise<void>((resolve) => {
    let settled = false
    let unsubscribe: (() => void) | null = null

    const handleAbort = (): void => cleanup()

    function cleanup(): void {
      if (settled) {
        return
      }
      settled = true
      args.signal?.removeEventListener('abort', handleAbort)
      unsubscribe?.()
      args.emit({ type: 'end' })
      resolve()
    }

    args.signal?.addEventListener('abort', handleAbort, { once: true })
    args.runtime.registerSubscriptionCleanup(args.subscriptionId, cleanup, args.connectionId)
    args.emit({ type: 'starting', subscriptionId: args.subscriptionId })

    void service
      .ensureWatched(args.worktree)
      .then(() => {
        if (settled) {
          return
        }
        unsubscribe = service.subscribe(args.worktree, () => {
          if (settled) {
            return
          }
          args.emit({ type: 'graph', graph: graphFor() })
        })
        args.emit({ type: 'ready', subscriptionId: args.subscriptionId, graph: graphFor() })
      })
      .catch((error: unknown) => {
        if (settled) {
          return
        }
        settled = true
        args.signal?.removeEventListener('abort', handleAbort)
        args.emit({
          type: 'error',
          message: error instanceof Error ? error.message : String(error)
        })
        args.emit({ type: 'end' })
        resolve()
      })
  })
}
