import { countNodeStates } from '../theme/node-state'
import type { ConnectionState, SceneState } from '../../application/scene-store'
import type { TerminalsState } from '../../application/terminal-session-model'
import type { WorktreeGraph } from '../../domain/worktree-graph/types'

/** Semantic palette token names — never raw hex; the DOM writer maps these to CSS vars. */
export type ConnectionDotTone = 'accent' | 'amber' | 'amberDim'

export type HudChip = { key: string; description: string }

export type HudModel = {
  connection: { label: string; dotColor: ConnectionDotTone }
  repo: { displayName: string; nodeCount: number } | null
  counters: ReturnType<typeof countNodeStates>
  chips: readonly HudChip[]
}

const connectionLabel = (connection: ConnectionState): string => {
  switch (connection.state) {
    case 'connecting':
      return 'conectando…'
    case 'connected':
      return `conectado · runtime ${connection.runtimeId}`
    case 'reconnecting':
      return `reconectando… · intento ${connection.attempt}`
    case 'down':
      return `desconectado · ${connection.reason}`
  }
}

const connectionDotColor = (connection: ConnectionState): ConnectionDotTone => {
  switch (connection.state) {
    case 'connecting':
      return 'amber'
    case 'connected':
      return 'accent'
    case 'reconnecting':
      return 'amber'
    case 'down':
      return 'amberDim'
  }
}

/** Terminal-aware chips (design Area 8): no terminal -> `[t]`; scene placement -> pin/tab/exit;
 *  hud placement -> its escena/close counterparts. Reflects `TerminalsState` only, no DOM. */
const terminalChips = (terminals: TerminalsState, selectedId: unknown): readonly HudChip[] => {
  const panel = terminals.activePanel
  if (!panel) {
    return selectedId === null ? [] : [{ key: 't', description: 'terminal' }]
  }
  const tabs = terminals.byNode.get(panel.nodeId) ?? []
  if (panel.placement === 'scene') {
    const chips: HudChip[] = [{ key: 'p', description: 'pin' }]
    if (tabs.length > 1) {
      chips.push({ key: '⇥', description: 'otra terminal' })
    }
    chips.push({ key: 'Ctrl+]', description: 'salir' })
    return chips
  }
  const chips: HudChip[] = [{ key: 'esc', description: 'cerrar panel' }]
  if (tabs.length > 1) {
    chips.push({ key: '⇥', description: 'otra terminal' })
  }
  chips.push({ key: 'p', description: 'escena' })
  return chips
}

const countNodesInRepo = (graph: WorktreeGraph, repoId: string): number => {
  let count = 0
  for (const node of graph.nodes.values()) {
    if (node.repoId === repoId) count++
  }
  return count
}

const activeRepoLine = (state: SceneState): HudModel['repo'] => {
  const { activeRepoId, list } = state.repos
  if (activeRepoId === null) return null
  const repo = list.find((candidate) => candidate.id === activeRepoId)
  if (!repo) return null
  return { displayName: repo.displayName, nodeCount: countNodesInRepo(state.graph, activeRepoId) }
}

const chipsFor = (platform: { isMac: boolean }): readonly HudChip[] => [
  { key: 'hjkl', description: 'navegar' },
  { key: 'f', description: 'focus' },
  { key: 'v', description: 'ver todo' },
  { key: 's', description: 'spawn' },
  { key: platform.isMac ? '⌘K' : 'Ctrl+K', description: 'paleta' },
  { key: platform.isMac ? '⌘P' : 'Ctrl+P', description: 'proyectos' }
]

export function hudModel(state: SceneState, platform: { isMac: boolean }): HudModel {
  return {
    connection: {
      label: connectionLabel(state.connection),
      dotColor: connectionDotColor(state.connection)
    },
    repo: activeRepoLine(state),
    counters: countNodeStates(state.graph),
    chips: [...chipsFor(platform), ...terminalChips(state.terminals, state.selection.selectedId)]
  }
}
