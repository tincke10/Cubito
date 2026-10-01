import type { AttentionNotification } from '../../application/ports/attention-notification-port'

export type BrowserNotificationPresenter = {
  present(notification: AttentionNotification): void
  /** Needs a user gesture to prompt; a no-op unless permission is still undecided. */
  requestPermissionOnce(): void
}

/** Browser Notification API wrapper; the API only exists in secure contexts (https/localhost). */
export function createBrowserNotificationPresenter(env: {
  notificationApi: typeof Notification | undefined
  isSecureContext: boolean
  focusWindow(): void
  onActivate(worktreeId: string): void
}): BrowserNotificationPresenter {
  let asked = false
  const api = env.isSecureContext ? env.notificationApi : undefined
  return {
    present(notification) {
      if (!api || api.permission !== 'granted') return
      try {
        const shown = new api(notification.title, {
          body: notification.body,
          ...(notification.notificationId ? { tag: notification.notificationId } : {})
        })
        shown.addEventListener('click', () => {
          env.focusWindow()
          if (notification.worktreeId) env.onActivate(notification.worktreeId)
        })
      } catch {
        // Why: some mobile browsers throw on the constructor; the HUD toast already covers it.
      }
    },
    requestPermissionOnce() {
      if (!api || asked || api.permission !== 'default') return
      asked = true
      void api.requestPermission().catch(() => undefined)
    }
  }
}
