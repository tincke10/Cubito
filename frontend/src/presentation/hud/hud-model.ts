import { countNodeStates } from '../theme/node-state'
import type { ConnectionState, SceneState } from '../../application/scene-store'

/** Semantic palette token names — never raw hex; the DOM writer maps these to CSS vars. */
export type ConnectionDotTone = 'accent' | 'amber' | 'amberDim'

export type HudChip = { key: string; description: string }

export type HudModel = {
  connection: { label: string; dotColor: ConnectionDotTone }
  repo: { name: string; baseBranch: string } | null
  counters: ReturnType<typeof countNodeStates>
  chips: readonly HudChip[]
}

const connectionLabel = (connection: ConnectionState): string => {
  switch (connection.state) {
    case 'connected':
      return `conectado · runtime ${connection.runtimeId}`
    case 'reconnecting':
      return 'reconectando…'
    case 'down':
      return `desconectado · ${connection.reason}`
  }
}

const connectionDotColor = (connection: ConnectionState): ConnectionDotTone => {
  switch (connection.state) {
    case 'connected':
      return 'accent'
    case 'reconnecting':
      return 'amber'
    case 'down':
      return 'amberDim'
  }
}

const chipsFor = (platform: { isMac: boolean }): readonly HudChip[] => [
  { key: 'hjkl', description: 'navegar' },
  { key: 'f', description: 'focus' },
  { key: 'v', description: 'ver todo' },
  { key: 's', description: 'spawn' },
  { key: platform.isMac ? '⌘K' : 'Ctrl+K', description: 'paleta' }
]

export function hudModel(state: SceneState, platform: { isMac: boolean }): HudModel {
  return {
    connection: {
      label: connectionLabel(state.connection),
      dotColor: connectionDotColor(state.connection)
    },
    repo: state.repo,
    counters: countNodeStates(state.graph),
    chips: chipsFor(platform)
  }
}
