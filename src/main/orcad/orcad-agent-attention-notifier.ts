import { buildAgentNotificationId } from '../../shared/agent-notification-id'
import type { AgentStatusState } from '../../shared/agent-status-types'
import { getWorktreePathBasenameFromId } from '../../shared/worktree/id'
import type { MobileNotificationDispatchEvent } from '../runtime/runtime-mobile-notification-controller'

// Why: the same windows the deleted renderer policy used, so a resumed turn can cancel a done.
const DONE_GRACE_WITH_DETAIL_MS = 250
const DONE_MAX_WAIT_MS = 1500
const MAX_NOTIFIED_IDS = 256
const BODY_PREVIEW_MAX_LENGTH = 180

/** Structural subset of the hook server's enriched status event. */
export type AttentionStatusEvent = {
  paneKey: string
  worktreeId?: string
  stateStartedAt: number
  isReplay?: boolean
  providerSessionOnly?: boolean
  payload: {
    state: AgentStatusState
    agentType?: string
    toolName?: string
    toolInput?: string
    lastAssistantMessage?: string
  }
}

type NotificationSettingsView = { enabled?: boolean; agentTaskComplete?: boolean }

export type OrcadAgentAttentionNotifier = {
  observe(event: AttentionStatusEvent): void
  dispose(): void
}

type PendingDone = { timer: ReturnType<typeof setTimeout>; event: AttentionStatusEvent }

const AGENT_LABELS: Readonly<Record<string, string>> = {
  claude: 'Claude',
  codex: 'Codex',
  gemini: 'Gemini',
  opencode: 'OpenCode',
  cursor: 'Cursor',
  grok: 'Grok'
}

function agentLabel(agentType: string | undefined): string {
  if (!agentType || agentType === 'unknown') {
    return 'Agent'
  }
  return AGENT_LABELS[agentType] ?? agentType.slice(0, 40)
}

function previewText(value: string | undefined): string | null {
  const text = value?.replace(/\s+/g, ' ').trim()
  if (!text) {
    return null
  }
  return text.length > BODY_PREVIEW_MAX_LENGTH
    ? `${text.slice(0, BODY_PREVIEW_MAX_LENGTH - 1)}…`
    : text
}

function buildBody(event: AttentionStatusEvent, statusText: string): string {
  const { lastAssistantMessage, toolName, toolInput } = event.payload
  return (
    previewText(lastAssistantMessage) ??
    (toolName && toolInput ? previewText(`Using ${toolName}: ${toolInput}`) : null) ??
    `${agentLabel(event.payload.agentType)} ${statusText}.`
  )
}

export function createOrcadAgentAttentionNotifier(deps: {
  dispatch: (event: MobileNotificationDispatchEvent) => void
  getNotificationSettings: () => NotificationSettingsView | undefined
  now?: () => number
}): OrcadAgentAttentionNotifier {
  const now = deps.now ?? Date.now
  const seenWorking = new Set<string>()
  const pendingDone = new Map<string, PendingDone>()
  const notifiedIds = new Set<string>()

  function enabled(): boolean {
    const settings = deps.getNotificationSettings()
    return settings?.enabled !== false && settings?.agentTaskComplete !== false
  }

  function cancelPending(paneKey: string): void {
    const pending = pendingDone.get(paneKey)
    if (pending) {
      clearTimeout(pending.timer)
      pendingDone.delete(paneKey)
    }
  }

  function emit(event: AttentionStatusEvent): void {
    if (!event.worktreeId || !enabled()) {
      return
    }
    const notificationId = buildAgentNotificationId({
      worktreeId: event.worktreeId,
      paneKey: event.paneKey,
      stateStartedAt: event.stateStartedAt
    })
    if (!notificationId || notifiedIds.has(notificationId)) {
      return
    }
    notifiedIds.add(notificationId)
    if (notifiedIds.size > MAX_NOTIFIED_IDS) {
      notifiedIds.delete(notifiedIds.values().next().value as string)
    }
    const state = event.payload.state
    const statusText = state === 'done' ? 'finished' : 'needs input'
    const context = getWorktreePathBasenameFromId(event.worktreeId) ?? 'workspace'
    deps.dispatch({
      type: 'notification',
      source: 'agent-task-complete',
      agentState: state,
      worktreeId: event.worktreeId,
      notificationId,
      emittedAt: now(),
      title: `${context} - ${agentLabel(event.payload.agentType)} ${statusText}`,
      body: buildBody(event, statusText)
    })
  }

  function scheduleDone(event: AttentionStatusEvent): void {
    const hasDetail = Boolean(event.payload.lastAssistantMessage)
    const previous = pendingDone.get(event.paneKey)
    // Why: a later update for the same turn only ever shortens the wait.
    if (previous && previous.event.stateStartedAt === event.stateStartedAt && !hasDetail) {
      return
    }
    cancelPending(event.paneKey)
    const delay = hasDetail ? DONE_GRACE_WITH_DETAIL_MS : DONE_MAX_WAIT_MS
    const timer = setTimeout(() => {
      pendingDone.delete(event.paneKey)
      emit(event)
    }, delay)
    pendingDone.set(event.paneKey, { timer, event })
  }

  return {
    observe(event) {
      if (event.isReplay || event.providerSessionOnly) {
        return
      }
      const { state } = event.payload
      if (state === 'working') {
        cancelPending(event.paneKey)
        seenWorking.add(event.paneKey)
        return
      }
      if (state === 'blocked' || state === 'waiting') {
        cancelPending(event.paneKey)
        emit(event)
        return
      }
      // Why: a done row restored from disk was never a turn this process watched finish.
      if (state === 'done' && seenWorking.has(event.paneKey)) {
        scheduleDone(event)
      }
    },
    dispose() {
      for (const paneKey of pendingDone.keys()) {
        cancelPending(paneKey)
      }
    }
  }
}
