import { describe, expect, it, vi } from 'vitest'
import { createAttentionNotificationBinder } from './bind-attention-notifications'
import type { LiveSyncConnection } from './application/live-worktree-sync'
import type {
  AttentionNotification,
  AttentionNotificationHandlers,
  AttentionNotificationPort
} from './application/ports/attention-notification-port'

const note: AttentionNotification = {
  notificationId: 'agent:1',
  seq: 1,
  title: 'T',
  body: 'B',
  worktreeId: 'r::/p',
  agentState: 'blocked'
}

function fakePort() {
  let handlers: AttentionNotificationHandlers | null = null
  const port: AttentionNotificationPort = {
    subscribe(h) {
      handlers = h
      return { close: vi.fn() }
    },
    getMissedSince: async () => ({ notifications: [], epoch: 'e' })
  }
  return {
    port,
    push: (n: AttentionNotification) =>
      handlers!.onFrame({ type: 'notification', notification: n, epoch: 'e' })
  }
}

describe('attention notification binder', () => {
  it('fans a live notification out to the toast and the OS presenter', () => {
    const toast = vi.fn()
    const os = vi.fn()
    const binder = createAttentionNotificationBinder({ toast, os })
    const fake = fakePort()
    binder.bind({ attentionNotifications: fake.port } as unknown as LiveSyncConnection)
    fake.push(note)
    expect(toast).toHaveBeenCalledWith(note)
    expect(os).toHaveBeenCalledWith(note)
  })

  it('ignores a connection without the attention port', () => {
    const binder = createAttentionNotificationBinder({ toast: vi.fn(), os: vi.fn() })
    expect(() => binder.bind({} as LiveSyncConnection)).not.toThrow()
  })
})
