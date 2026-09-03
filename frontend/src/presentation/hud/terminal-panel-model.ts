import type {
  TerminalPlacement,
  TerminalSessionStatus,
  TerminalsState
} from '../../application/terminal-session-model'
import type { WorktreeId } from '../../domain/worktree-graph/types'

/** Semantic chrome tones — the DOM writer maps these to `--cubito-*` custom properties. */
export type PanelTone = 'info' | 'panelSurface' | 'panelBorder'

export type TerminalPanelTab = { streamId: number; label: string }

export type TerminalPanelModel = {
  nodeId: WorktreeId
  header: string
  placement: TerminalPlacement
  focused: boolean
  connectorVisible: boolean
  status: TerminalSessionStatus
  tabs: readonly TerminalPanelTab[]
  activeTabIndex: number
  tone: { connector: PanelTone; surface: PanelTone; border: PanelTone }
}

const FALLBACK_TITLE = 'shell'

/**
 * Pure render model for the in-scene/HUD terminal panel (design Area 6). Bytes never flow
 * through here — this only projects lifecycle/placement metadata from the terminals slice.
 */
export function terminalPanelModel(state: TerminalsState): TerminalPanelModel | null {
  const panel = state.activePanel
  if (!panel) return null

  const tabStreamIds = state.byNode.get(panel.nodeId) ?? []
  const activeStreamId = tabStreamIds[panel.sessionIndex]
  const activeSession =
    activeStreamId !== undefined ? state.sessions.get(activeStreamId) : undefined
  if (!activeSession) return null

  const tabs = tabStreamIds.map((streamId) => ({
    streamId,
    label: state.sessions.get(streamId)?.title ?? FALLBACK_TITLE
  }))

  return {
    nodeId: panel.nodeId,
    header: `terminal ${panel.sessionIndex + 1}/${tabStreamIds.length} · ${activeSession.title ?? FALLBACK_TITLE}`,
    placement: panel.placement,
    focused: panel.focused,
    connectorVisible: panel.placement === 'scene',
    status: activeSession.status,
    tabs,
    activeTabIndex: panel.sessionIndex,
    tone: { connector: 'info', surface: 'panelSurface', border: 'panelBorder' }
  }
}
