import type { SceneState } from './scene-store'

export type CommandId =
  | 'focus'
  | 'fit-all'
  | 'open-terminal'
  | 'open-spawn'
  | 'open-projects'
  | 'add-repo'
  | 'fan-out'
  | 'open-system'
  | 'open-diff'

export type CommandAvailability = { readonly hasSelection: boolean; readonly isConnected: boolean }

export type PaletteCommand = {
  readonly id: CommandId
  readonly label: string
  readonly keybindingHint: string
  readonly isAvailable: (availability: CommandAvailability) => boolean
}

/** Projects SceneState into the flags the catalog's predicates read — 'reconnecting'/'connecting'/
 *  'down' all count as not connected (commands stay disabled through connection blips). */
export const toCommandAvailability = (state: SceneState): CommandAvailability => ({
  hasSelection: state.selection.selectedId !== null,
  isConnected: state.connection.state === 'connected'
})

/** Static, ordered ⌘K catalog (proposal order). Pure and deterministic given platform — the one
 *  platform-variant hint (open-projects) resolves here instead of through DOM/env lookups. */
export const commandCatalog = (platform: { isMac: boolean }): readonly PaletteCommand[] => [
  { id: 'focus', label: 'focus', keybindingHint: 'f', isAvailable: (a) => a.hasSelection },
  { id: 'fit-all', label: 'ver todo', keybindingHint: 'v', isAvailable: () => true },
  {
    id: 'open-terminal',
    label: 'abrir terminal',
    keybindingHint: 't',
    isAvailable: (a) => a.hasSelection && a.isConnected
  },
  {
    id: 'open-spawn',
    label: 'spawn worktree',
    keybindingHint: 's',
    isAvailable: (a) => a.isConnected
  },
  {
    id: 'open-projects',
    label: 'proyectos',
    keybindingHint: platform.isMac ? '⌘P' : 'Ctrl+P',
    isAvailable: () => true
  },
  {
    id: 'add-repo',
    label: 'agregar repo',
    keybindingHint: '—',
    isAvailable: (a) => a.isConnected
  },
  {
    id: 'fan-out',
    label: 'fan-out',
    keybindingHint: '—',
    isAvailable: (a) => a.hasSelection && a.isConnected
  },
  {
    id: 'open-system',
    label: 'sistema en vivo',
    keybindingHint: 'x',
    // Unlike open-terminal, no isConnected gate — the demo graph stub works offline.
    isAvailable: (a) => a.hasSelection
  },
  {
    id: 'open-diff',
    label: 'diff',
    keybindingHint: 'd',
    // Mirrors open-system: hasSelection only — the demo gateway's gitBranchCompare stub
    // resolves offline too, so no isConnected gate.
    isAvailable: (a) => a.hasSelection
  }
]
