/** One agent-attention notification as the host dispatched it (additive wire fields only). */
export type AttentionNotification = {
  notificationId: string | null
  /** Host-assigned monotonic watermark; absent on a host that predates replay. */
  seq: number | null
  title: string
  body: string
  worktreeId: string | null
  agentState: 'working' | 'blocked' | 'waiting' | 'done' | null
}

export type AttentionNotificationFrame =
  | { type: 'ready'; epoch: string | null }
  | { type: 'notification'; notification: AttentionNotification; epoch: string | null }

export type AttentionNotificationHandlers = {
  onFrame(frame: AttentionNotificationFrame): void
  /** `method_not_found` — old host, no `notifications.subscribe`. Fires at most once. */
  onUnsupported(): void
  onClosed(): void
}

export type MissedAttentionNotifications = {
  notifications: AttentionNotification[]
  epoch: string | null
}

/** Port to the orcad `notifications.subscribe` stream plus its `getMissedSince` catch-up. */
export type AttentionNotificationPort = {
  subscribe(handlers: AttentionNotificationHandlers): { close(): void }
  getMissedSince(lastSeenSeq: number, epoch: string | null): Promise<MissedAttentionNotifications>
}
