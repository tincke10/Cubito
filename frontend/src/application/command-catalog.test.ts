import { describe, expect, it } from 'vitest'
import { commandCatalog, toCommandAvailability } from './command-catalog'
import type { CommandAvailability, CommandId } from './command-catalog'
import type { SceneState } from './scene-store'
import { emptyWorktreeGraph } from '../domain/worktree-graph/types'
import { emptyTerminalsState } from './terminal-session-model'
import { emptySpawnMenuSlice } from './spawn-menu-model'
import { emptyReposSlice } from './repos-model'
import { emptyProjectSelectorSlice } from './project-selector-model'
import { emptyCommandPaletteSlice } from './command-palette-model'
import { emptyFanOutSlice } from './fan-out-model'

const state = (overrides: Partial<SceneState> = {}): SceneState => ({
  graph: emptyWorktreeGraph(),
  sync: { state: 'idle' },
  connection: { state: 'down', reason: 'not connected' },
  selection: { selectedId: null },
  terminals: emptyTerminalsState(),
  spawnMenu: emptySpawnMenuSlice(),
  repos: emptyReposSlice(),
  projectSelector: emptyProjectSelectorSlice(),
  commandPalette: emptyCommandPaletteSlice(),
  fanOut: emptyFanOutSlice(),
  ...overrides
})

const findCommand = (catalog: ReturnType<typeof commandCatalog>, id: CommandId) => {
  const command = catalog.find((c) => c.id === id)
  if (!command) throw new Error(`missing command ${id}`)
  return command
}

describe('commandCatalog', () => {
  const mac = commandCatalog({ isMac: true })
  const other = commandCatalog({ isMac: false })

  it('orders the 7 commands per the proposal', () => {
    expect(mac.map((c) => c.id)).toEqual([
      'focus',
      'fit-all',
      'open-terminal',
      'open-spawn',
      'open-projects',
      'add-repo',
      'fan-out'
    ])
  })

  it('carries the static Spanish labels and keybinding hints', () => {
    expect(findCommand(mac, 'focus')).toMatchObject({ label: 'focus', keybindingHint: 'f' })
    expect(findCommand(mac, 'fit-all')).toMatchObject({ label: 'ver todo', keybindingHint: 'v' })
    expect(findCommand(mac, 'open-terminal')).toMatchObject({
      label: 'abrir terminal',
      keybindingHint: 't'
    })
    expect(findCommand(mac, 'open-spawn')).toMatchObject({
      label: 'spawn worktree',
      keybindingHint: 's'
    })
    expect(findCommand(mac, 'add-repo')).toMatchObject({
      label: 'agregar repo',
      keybindingHint: '—'
    })
    expect(findCommand(mac, 'fan-out')).toMatchObject({ label: 'fan-out', keybindingHint: '—' })
  })

  it('open-projects hint is ⌘P on Mac and Ctrl+P elsewhere', () => {
    expect(findCommand(mac, 'open-projects')).toMatchObject({
      label: 'proyectos',
      keybindingHint: '⌘P'
    })
    expect(findCommand(other, 'open-projects')).toMatchObject({
      label: 'proyectos',
      keybindingHint: 'Ctrl+P'
    })
  })

  const matrix: readonly [CommandId, CommandAvailability, boolean][] = [
    ['focus', { hasSelection: true, isConnected: true }, true],
    ['focus', { hasSelection: false, isConnected: true }, false],
    ['fit-all', { hasSelection: false, isConnected: false }, true],
    ['open-terminal', { hasSelection: true, isConnected: true }, true],
    ['open-terminal', { hasSelection: true, isConnected: false }, false],
    ['open-terminal', { hasSelection: false, isConnected: true }, false],
    ['open-spawn', { hasSelection: false, isConnected: true }, true],
    ['open-spawn', { hasSelection: false, isConnected: false }, false],
    ['open-projects', { hasSelection: false, isConnected: false }, true],
    ['add-repo', { hasSelection: false, isConnected: true }, true],
    ['add-repo', { hasSelection: false, isConnected: false }, false],
    ['fan-out', { hasSelection: true, isConnected: true }, false]
  ]

  it.each(matrix)('%s isAvailable(%o) => %s', (id, availability, expected) => {
    expect(findCommand(mac, id).isAvailable(availability)).toBe(expected)
  })
})

describe('toCommandAvailability', () => {
  it('hasSelection reflects a non-null selectedId', () => {
    expect(toCommandAvailability(state()).hasSelection).toBe(false)
    expect(toCommandAvailability(state({ selection: { selectedId: 'w1' } })).hasSelection).toBe(
      true
    )
  })

  it('isConnected is true only when connection.state is connected', () => {
    expect(
      toCommandAvailability(state({ connection: { state: 'connected', runtimeId: 'rt-1' } }))
        .isConnected
    ).toBe(true)
    expect(
      toCommandAvailability(
        state({ connection: { state: 'reconnecting', attempt: 1, nextRetryInMs: 100 } })
      ).isConnected
    ).toBe(false)
    expect(toCommandAvailability(state({ connection: { state: 'connecting' } })).isConnected).toBe(
      false
    )
    expect(
      toCommandAvailability(state({ connection: { state: 'down', reason: 'x' } })).isConnected
    ).toBe(false)
  })
})
