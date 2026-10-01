import { RpcCallError } from './rpc-connection'
import type { OpenRpcStream, StreamHandlers } from './rpc-connection'
import type { RpcSuccessFrame } from './envelope'
import type {
  AttentionNotification,
  AttentionNotificationPort
} from '../../application/ports/attention-notification-port'

/** The two RpcConnection methods the adapter needs; eases test doubles. */
export type NotificationConnection = {
  openStream(method: string, params: unknown, handlers: StreamHandlers): OpenRpcStream
  call(method: string, params?: unknown): Promise<RpcSuccessFrame>
}

const AGENT_STATES = ['working', 'blocked', 'waiting', 'done'] as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function optionalText(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

/** Projects a raw `type: 'notification'` event; anything else (dismiss, future types) -> null. */
function toAttentionNotification(raw: unknown): AttentionNotification | null {
  if (!isRecord(raw) || raw.type !== 'notification') return null
  return {
    notificationId: optionalText(raw.notificationId),
    seq: typeof raw.notificationSeq === 'number' ? raw.notificationSeq : null,
    title: text(raw.title),
    body: text(raw.body),
    worktreeId: optionalText(raw.worktreeId),
    agentState: (AGENT_STATES as readonly unknown[]).includes(raw.agentState)
      ? (raw.agentState as AttentionNotification['agentState'])
      : null
  }
}

/**
 * Adapter over `notifications.subscribe` + `notifications.getMissedSince`. No new wire
 * surface: both methods are upstream's; `includeDesktopSuppressed` opts out of the legacy
 * per-worktree cooldown so a blocked agent right after a finished one is never swallowed.
 */
export function createAttentionNotificationPort(
  connection: NotificationConnection
): AttentionNotificationPort {
  return {
    subscribe(handlers) {
      let subscriptionId: string | null = null
      let notified = false
      let streamHandle: OpenRpcStream | null = null
      let closePending = false

      function closeTransport(): void {
        if (streamHandle) streamHandle.close()
        else closePending = true
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
        'notifications.subscribe',
        { includeDesktopSuppressed: true },
        {
          onEmit(result) {
            if (notified || !isRecord(result) || typeof result.type !== 'string') return
            const epoch = optionalText(result.epoch ?? result.notificationEpoch)
            if (result.type === 'ready') {
              subscriptionId = text(result.subscriptionId)
              handlers.onFrame({ type: 'ready', epoch })
              return
            }
            if (result.type === 'end' || result.type === 'error') {
              notifyClosed()
              return
            }
            const notification = toAttentionNotification(result)
            if (notification) handlers.onFrame({ type: 'notification', notification, epoch })
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
      if (closePending) streamHandle.close()

      return {
        close() {
          notified = true
          if (subscriptionId) {
            void connection
              .call('notifications.unsubscribe', { subscriptionId })
              .catch(() => undefined)
          }
          closeTransport()
        }
      }
    },
    async getMissedSince(lastSeenSeq, epoch) {
      const response = await connection.call('notifications.getMissedSince', {
        lastSeenSeq,
        ...(epoch ? { epoch } : {}),
        includeDesktopSuppressed: true
      })
      const result = isRecord(response.result) ? response.result : {}
      const raw = Array.isArray(result.notifications) ? result.notifications : []
      return {
        notifications: raw.flatMap((entry) => {
          const notification = toAttentionNotification(entry)
          return notification ? [notification] : []
        }),
        epoch: optionalText(result.epoch)
      }
    }
  }
}
