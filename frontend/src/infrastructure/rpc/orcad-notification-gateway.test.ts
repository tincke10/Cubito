import { describe, expect, it, vi } from 'vitest'
import { createAttentionNotificationPort } from './orcad-notification-gateway'
import type { NotificationConnection } from './orcad-notification-gateway'
import { RpcCallError } from './rpc-connection'
import type { StreamHandlers } from './rpc-connection'

function createFake() {
  let captured: StreamHandlers | null = null
  const streamClose = vi.fn()
  const call = vi.fn(async (_method: string, _params?: unknown) => ({
    id: 'x',
    ok: true as const,
    result: {} as unknown,
    _meta: { runtimeId: 'rt' }
  }))
  const openStream = vi.fn((_m: string, _p: unknown, handlers: StreamHandlers) => {
    captured = handlers
    return { close: streamClose }
  })
  const connection: NotificationConnection = { openStream, call }
  return {
    connection,
    openStream,
    call,
    streamClose,
    emit: (r: unknown) => captured?.onEmit(r),
    fail: (e: RpcCallError) => captured?.onError(e),
    closeTransport: () => captured?.onClose()
  }
}

const handlers = () => ({ onFrame: vi.fn(), onUnsupported: vi.fn(), onClosed: vi.fn() })

describe('createAttentionNotificationPort', () => {
  it('opens notifications.subscribe including desktop-suppressed events', () => {
    const fake = createFake()
    createAttentionNotificationPort(fake.connection).subscribe(handlers())
    expect(fake.openStream).toHaveBeenCalledWith(
      'notifications.subscribe',
      { includeDesktopSuppressed: true },
      expect.anything()
    )
  })

  it('maps ready and notification frames, dropping dismiss and unknown frames', () => {
    const fake = createFake()
    const h = handlers()
    createAttentionNotificationPort(fake.connection).subscribe(h)
    fake.emit({ type: 'ready', subscriptionId: 's', epoch: 'e1' })
    fake.emit({
      type: 'notification',
      title: 'wt - Claude needs input',
      body: 'Using Bash',
      worktreeId: 'r::/p',
      notificationId: 'agent:1',
      notificationSeq: 4,
      notificationEpoch: 'e1',
      agentState: 'blocked'
    })
    fake.emit({ type: 'dismiss', notificationId: 'agent:1' })
    fake.emit({ type: 'starting' })
    expect(h.onFrame).toHaveBeenCalledTimes(2)
    expect(h.onFrame).toHaveBeenNthCalledWith(1, { type: 'ready', epoch: 'e1' })
    expect(h.onFrame).toHaveBeenNthCalledWith(2, {
      type: 'notification',
      epoch: 'e1',
      notification: {
        notificationId: 'agent:1',
        seq: 4,
        title: 'wt - Claude needs input',
        body: 'Using Bash',
        worktreeId: 'r::/p',
        agentState: 'blocked'
      }
    })
  })

  it('reports method_not_found as unsupported and other failures as closed', () => {
    const a = createFake()
    const ha = handlers()
    createAttentionNotificationPort(a.connection).subscribe(ha)
    a.fail(new RpcCallError('method_not_found', 'nope'))
    expect(ha.onUnsupported).toHaveBeenCalledTimes(1)
    expect(ha.onClosed).not.toHaveBeenCalled()
    expect(a.streamClose).toHaveBeenCalledTimes(1)

    const b = createFake()
    const hb = handlers()
    createAttentionNotificationPort(b.connection).subscribe(hb)
    b.closeTransport()
    b.closeTransport()
    expect(hb.onClosed).toHaveBeenCalledTimes(1)
  })

  it('close() unsubscribes by subscriptionId and silences handlers', () => {
    const fake = createFake()
    const h = handlers()
    const sub = createAttentionNotificationPort(fake.connection).subscribe(h)
    fake.emit({ type: 'ready', subscriptionId: 'sub-9', epoch: 'e' })
    sub.close()
    expect(fake.call).toHaveBeenCalledWith('notifications.unsubscribe', { subscriptionId: 'sub-9' })
    fake.closeTransport()
    expect(h.onClosed).not.toHaveBeenCalled()
  })

  it('getMissedSince projects notifications and ignores dismiss entries', async () => {
    const fake = createFake()
    fake.call.mockResolvedValueOnce({
      id: 'x',
      ok: true,
      result: {
        epoch: 'e2',
        notifications: [
          { type: 'notification', title: 'T', body: 'B', notificationSeq: 7, notificationId: 'n7' },
          { type: 'dismiss', notificationId: 'n7' }
        ]
      },
      _meta: { runtimeId: 'rt' }
    })
    const missed = await createAttentionNotificationPort(fake.connection).getMissedSince(3, 'e2')
    expect(fake.call).toHaveBeenCalledWith('notifications.getMissedSince', {
      lastSeenSeq: 3,
      epoch: 'e2',
      includeDesktopSuppressed: true
    })
    expect(missed.epoch).toBe('e2')
    expect(missed.notifications).toEqual([
      {
        notificationId: 'n7',
        seq: 7,
        title: 'T',
        body: 'B',
        worktreeId: null,
        agentState: null
      }
    ])
  })
})
