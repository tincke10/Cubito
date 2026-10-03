import { t } from './i18n/translate'
import type { AttentionNotification } from './ports/attention-notification-port'

// Host title shape: "<worktree> - <Agent> finished|needs input" (orcad-agent-attention-notifier).
const HOST_TITLE = /^(.*) - (\S+) (?:finished|needs input)$/

/** Rewrites the engine's English title from the structured agentState; body is the engine's own. */
export function localizeAttentionNotification(
  notification: AttentionNotification
): AttentionNotification {
  const state = notification.agentState
  if (state !== 'done' && state !== 'blocked' && state !== 'waiting') return notification
  const match = HOST_TITLE.exec(notification.title)
  if (!match) return notification
  const [, context = '', agent = ''] = match
  const key = state === 'done' ? 'notifications.finished' : 'notifications.needsInput'
  return { ...notification, title: t(key, { context, agent }) }
}
