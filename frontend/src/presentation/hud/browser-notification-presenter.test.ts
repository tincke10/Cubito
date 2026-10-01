import { describe, expect, it, vi } from 'vitest'
import { createBrowserNotificationPresenter } from './browser-notification-presenter'
import type { AttentionNotification } from '../../application/ports/attention-notification-port'

const note: AttentionNotification = {
  notificationId: 'agent:1',
  seq: null,
  title: 'wt - Claude finished',
  body: 'Done.',
  worktreeId: 'r::/p',
  agentState: 'done'
}

function fakeNotificationApi(permission: NotificationPermission) {
  const created: { title: string; options: NotificationOptions; clickListener?: () => void }[] = []
  const requestPermission = vi.fn(async () => 'granted' as NotificationPermission)
  class FakeNotification {
    static permission = permission
    static requestPermission = requestPermission
    private readonly record: (typeof created)[number]
    constructor(title: string, options: NotificationOptions) {
      this.record = { title, options }
      created.push(this.record)
    }
    addEventListener(_type: string, listener: () => void) {
      this.record.clickListener = listener
    }
  }
  return { api: FakeNotification as unknown as typeof Notification, created, requestPermission }
}

describe('browser notification presenter', () => {
  it('shows an OS notification when permission is granted in a secure context', () => {
    const { api, created } = fakeNotificationApi('granted')
    const onActivate = vi.fn()
    const presenter = createBrowserNotificationPresenter({
      notificationApi: api,
      isSecureContext: true,
      focusWindow: vi.fn(),
      onActivate
    })
    presenter.present(note)
    expect(created).toHaveLength(1)
    expect(created[0]!.title).toBe('wt - Claude finished')
    expect(created[0]!.options).toMatchObject({ body: 'Done.', tag: 'agent:1' })
    created[0]!.clickListener!()
    expect(onActivate).toHaveBeenCalledWith('r::/p')
  })

  it.each([
    ['not granted', 'default', true],
    ['an insecure context', 'granted', false]
  ] as const)('stays silent on %s', (_label, permission, isSecureContext) => {
    const { api, created } = fakeNotificationApi(permission)
    createBrowserNotificationPresenter({
      notificationApi: api,
      isSecureContext,
      focusWindow: vi.fn(),
      onActivate: vi.fn()
    }).present(note)
    expect(created).toHaveLength(0)
  })

  it('is a no-op when the Notification API does not exist', () => {
    const presenter = createBrowserNotificationPresenter({
      notificationApi: undefined,
      isSecureContext: true,
      focusWindow: vi.fn(),
      onActivate: vi.fn()
    })
    expect(() => presenter.present(note)).not.toThrow()
    expect(() => presenter.requestPermissionOnce()).not.toThrow()
  })

  it('asks for permission once, only when undecided and secure', () => {
    const { api, requestPermission } = fakeNotificationApi('default')
    const presenter = createBrowserNotificationPresenter({
      notificationApi: api,
      isSecureContext: true,
      focusWindow: vi.fn(),
      onActivate: vi.fn()
    })
    presenter.requestPermissionOnce()
    presenter.requestPermissionOnce()
    expect(requestPermission).toHaveBeenCalledTimes(1)

    const insecure = fakeNotificationApi('default')
    createBrowserNotificationPresenter({
      notificationApi: insecure.api,
      isSecureContext: false,
      focusWindow: vi.fn(),
      onActivate: vi.fn()
    }).requestPermissionOnce()
    expect(insecure.requestPermission).not.toHaveBeenCalled()
  })
})
