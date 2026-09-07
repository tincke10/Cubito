import { RpcCallError } from './rpc-connection'
import type { OpenRpcStream, StreamHandlers } from './rpc-connection'
import type { RpcSuccessFrame } from './envelope'
import { toSystemGraphSnapshot } from './system-graph-snapshot-projection'
import type { SystemGraphSnapshot } from '../../application/ports/runtime-gateway'
import type {
  SystemGraphStreamHandlers,
  SystemGraphStreamPort
} from '../../application/ports/system-graph-stream-port'

/** The two RpcConnection methods the adapter needs; eases test doubles (mirrors `RpcCaller`). */
export type SystemWatchConnection = {
  openStream(method: string, params: unknown, handlers: StreamHandlers): OpenRpcStream
  call(method: string, params?: unknown): Promise<RpcSuccessFrame>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function snapshotOf(result: Record<string, unknown>): SystemGraphSnapshot {
  return toSystemGraphSnapshot(isRecord(result.graph) ? result.graph : {})
}

/**
 * Adapter over `RpcConnection.openStream('system.watch', ...)`: absorbs the wire's
 * `starting`/`error`/`end` bookkeeping into `SystemGraphStreamHandlers`'s
 * ready/graph/onUnsupported/onClosed surface. `openStream` does not delete its stream entry on
 * an error frame (rpc-connection.ts) — every terminal path here closes the transport stream
 * itself, exactly once, so no further frame is ever delivered afterwards.
 */
export function createSystemGraphStreamPort(
  connection: SystemWatchConnection
): SystemGraphStreamPort {
  return {
    watch(worktree, handlers: SystemGraphStreamHandlers) {
      let subscriptionId: string | null = null
      let notified = false
      let streamHandle: OpenRpcStream | null = null
      let closePending = false

      function closeTransport(): void {
        if (streamHandle) {
          streamHandle.close()
        } else {
          closePending = true
        }
      }

      function notifyClosed(): void {
        if (notified) return
        notified = true
        closeTransport()
        handlers.onClosed()
      }

      function notifyUnsupported(): void {
        if (notified) return
        notified = true
        closeTransport()
        handlers.onUnsupported()
      }

      streamHandle = connection.openStream(
        'system.watch',
        { worktree },
        {
          onEmit(result) {
            if (notified || !isRecord(result) || typeof result.type !== 'string') return
            switch (result.type) {
              case 'ready': {
                const id = typeof result.subscriptionId === 'string' ? result.subscriptionId : ''
                subscriptionId = id
                handlers.onFrame({
                  type: 'ready',
                  subscriptionId: id,
                  snapshot: snapshotOf(result)
                })
                return
              }
              case 'graph':
                handlers.onFrame({ type: 'graph', snapshot: snapshotOf(result) })
                return
              case 'error':
              case 'end':
                notifyClosed()
                return
              default:
                return // 'starting' or an unrecognized future frame — ignore
            }
          },
          onError(error) {
            if (error instanceof RpcCallError && error.code === 'method_not_found') {
              notifyUnsupported()
              return
            }
            notifyClosed()
          },
          onClose() {
            notifyClosed()
          }
        }
      )
      if (closePending) {
        streamHandle.close()
      }

      return {
        close() {
          notified = true // caller-initiated: no further handler notifications
          if (subscriptionId !== null) {
            void connection.call('system.unwatch', { subscriptionId })
          }
          closeTransport()
        }
      }
    }
  }
}
