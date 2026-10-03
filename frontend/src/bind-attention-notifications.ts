import { createAttentionNotificationController } from './application/attention-notification-controller'
import type { LiveSyncConnection } from './application/live-worktree-sync'
import { localizeAttentionNotification } from './application/attention-notification-copy'
import type { AttentionNotification } from './application/ports/attention-notification-port'

export type AttentionNotificationBinder = { bind(connection: LiveSyncConnection): void }

/** Extracted out of main.ts (max-lines ratchet): one controller, rebound on every reconnect. */
export function createAttentionNotificationBinder(sinks: {
  toast(notification: AttentionNotification): void
  os(notification: AttentionNotification): void
}): AttentionNotificationBinder {
  const controller = createAttentionNotificationController({
    show: (notification) => {
      // Why: both sinks render the title, so localize once before fanning out.
      const localized = localizeAttentionNotification(notification)
      sinks.toast(localized)
      sinks.os(localized)
    }
  })
  return {
    bind(connection) {
      if (connection.attentionNotifications) controller.bind(connection.attentionNotifications)
    }
  }
}
