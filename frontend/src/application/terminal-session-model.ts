import type { WorktreeId } from '../domain/worktree-graph/types'

export type TerminalPlacement = 'scene' | 'hud'
export type TerminalSessionStatus =
  | 'creating'
  | 'subscribing'
  | 'snapshotting'
  | 'live'
  | 'error'
  | 'ended'

export type TerminalSession = {
  streamId: number
  nodeId: WorktreeId
  handle: string | null
  status: TerminalSessionStatus
  cols?: number
  rows?: number
  title?: string
  error?: string
  /** Output-buffer bookkeeping (metadata only) — bytes go frame->xterm directly, never here. */
  hasOutput: boolean
}

export type ActivePanel = {
  nodeId: WorktreeId
  sessionIndex: number
  placement: TerminalPlacement
  focused: boolean
}

export type TerminalsState = {
  sessions: ReadonlyMap<number, TerminalSession>
  /** Multiplex tab order per node, client-allocated streamIds. */
  byNode: ReadonlyMap<WorktreeId, readonly number[]>
  activePanel: ActivePanel | null
  /** Client-allocated, monotonic, >=1. Recycling after close is safe (server force-detaches a
   * reused slot without `end`) but not required, so this never decreases. */
  nextStreamId: number
}

export const emptyTerminalsState = (): TerminalsState => ({
  sessions: new Map(),
  byNode: new Map(),
  activePanel: null,
  nextStreamId: 1
})

export type TerminalAction =
  | { type: 'open-terminal-for-node'; nodeId: WorktreeId }
  | { type: 'subscribed'; streamId: number; terminal: string; cols: number; rows: number }
  | { type: 'output-arrived'; streamId: number }
  | { type: 'set-placement'; placement: TerminalPlacement }
  | { type: 'set-focused'; focused: boolean }
  | { type: 'next-tab'; nodeId: WorktreeId }
  | { type: 'close-terminal'; streamId: number }
  | { type: 'connection-lost' }
  | { type: 'connection-regained' }

export function reduceTerminals(state: TerminalsState, action: TerminalAction): TerminalsState {
  switch (action.type) {
    case 'open-terminal-for-node':
      return openTerminalForNode(state, action.nodeId)
    case 'subscribed':
      return withSession(state, action.streamId, (session) => ({
        ...session,
        handle: action.terminal,
        cols: action.cols,
        rows: action.rows,
        status: 'snapshotting'
      }))
    case 'output-arrived':
      return withSession(state, action.streamId, (session) => ({
        ...session,
        status: session.status === 'ended' || session.status === 'error' ? session.status : 'live',
        hasOutput: true
      }))
    case 'set-placement':
      return withActivePanel(state, (panel) => ({ ...panel, placement: action.placement }))
    case 'set-focused':
      return withActivePanel(state, (panel) => ({ ...panel, focused: action.focused }))
    case 'next-tab':
      return nextTab(state, action.nodeId)
    case 'close-terminal':
      return closeTerminal(state, action.streamId)
    case 'connection-lost':
      return markAllSubscribing(state)
    case 'connection-regained':
      return resetErrorsToCreating(state)
    default:
      return state
  }
}

function openTerminalForNode(state: TerminalsState, nodeId: WorktreeId): TerminalsState {
  const streamId = state.nextStreamId
  const session: TerminalSession = {
    streamId,
    nodeId,
    handle: null,
    status: 'creating',
    hasOutput: false
  }

  const sessions = new Map(state.sessions)
  sessions.set(streamId, session)

  const tabs = [...(state.byNode.get(nodeId) ?? []), streamId]
  const byNode = new Map(state.byNode)
  byNode.set(nodeId, tabs)

  const sameNodeActive = state.activePanel?.nodeId === nodeId
  return {
    sessions,
    byNode,
    activePanel: {
      nodeId,
      sessionIndex: tabs.length - 1,
      placement: sameNodeActive ? state.activePanel!.placement : 'scene',
      focused: true
    },
    nextStreamId: streamId + 1
  }
}

function withSession(
  state: TerminalsState,
  streamId: number,
  update: (session: TerminalSession) => TerminalSession
): TerminalsState {
  const session = state.sessions.get(streamId)
  if (!session) return state
  const sessions = new Map(state.sessions)
  sessions.set(streamId, update(session))
  return { ...state, sessions }
}

function withActivePanel(
  state: TerminalsState,
  update: (panel: ActivePanel) => ActivePanel
): TerminalsState {
  if (!state.activePanel) return state
  return { ...state, activePanel: update(state.activePanel) }
}

function nextTab(state: TerminalsState, nodeId: WorktreeId): TerminalsState {
  const tabs = state.byNode.get(nodeId)
  if (!tabs || tabs.length === 0) return state
  const sameNodeActive = state.activePanel?.nodeId === nodeId
  const currentIndex = sameNodeActive ? state.activePanel!.sessionIndex : -1
  return {
    ...state,
    activePanel: {
      nodeId,
      sessionIndex: (currentIndex + 1) % tabs.length,
      placement: sameNodeActive ? state.activePanel!.placement : 'scene',
      focused: sameNodeActive ? state.activePanel!.focused : true
    }
  }
}

function closeTerminal(state: TerminalsState, streamId: number): TerminalsState {
  const session = state.sessions.get(streamId)
  if (!session) return state

  const sessions = new Map(state.sessions)
  sessions.delete(streamId)

  const remaining = (state.byNode.get(session.nodeId) ?? []).filter((id) => id !== streamId)
  const byNode = new Map(state.byNode)
  if (remaining.length > 0) {
    byNode.set(session.nodeId, remaining)
  } else {
    byNode.delete(session.nodeId)
  }

  let activePanel = state.activePanel
  if (activePanel?.nodeId === session.nodeId) {
    activePanel =
      remaining.length === 0
        ? null
        : { ...activePanel, sessionIndex: Math.min(activePanel.sessionIndex, remaining.length - 1) }
  }

  return { sessions, byNode, activePanel, nextStreamId: state.nextStreamId }
}

function markAllSubscribing(state: TerminalsState): TerminalsState {
  const sessions = new Map(state.sessions)
  let changed = false
  for (const [id, session] of sessions) {
    if (session.status !== 'ended' && session.status !== 'subscribing') {
      sessions.set(id, { ...session, status: 'subscribing' })
      changed = true
    }
  }
  return changed ? { ...state, sessions } : state
}

function resetErrorsToCreating(state: TerminalsState): TerminalsState {
  const sessions = new Map(state.sessions)
  let changed = false
  for (const [id, session] of sessions) {
    if (session.status === 'error') {
      const { error: _error, ...rest } = session
      sessions.set(id, { ...rest, status: 'creating' })
      changed = true
    }
  }
  return changed ? { ...state, sessions } : state
}
