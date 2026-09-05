import { emptyWorktreeGraph } from '../domain/worktree-graph/types'
import type { WorktreeGraph, WorktreeId } from '../domain/worktree-graph/types'
import { emptyTerminalsState, reduceTerminals } from './terminal-session-model'
import type { TerminalAction, TerminalsState } from './terminal-session-model'
import { emptySpawnMenuSlice, reduceSpawnMenu } from './spawn-menu-model'
import type { SpawnMenuAction, SpawnMenuSlice } from './spawn-menu-model'
import { emptyReposSlice, reduceRepos } from './repos-model'
import type { ReposAction, ReposSlice } from './repos-model'
import { emptyProjectSelectorSlice, reduceProjectSelector } from './project-selector-model'
import type { ProjectSelectorAction, ProjectSelectorSlice } from './project-selector-model'
import { emptyCommandPaletteSlice, reduceCommandPalette } from './command-palette-model'
import type { CommandPaletteAction, CommandPaletteSlice } from './command-palette-model'
import { composeFanOutGraph, emptyFanOutSlice, reduceFanOut } from './fan-out-model'
import type { FanOutAction, FanOutSlice } from './fan-out-model'

export type SyncStatus =
  | { state: 'idle' }
  | { state: 'syncing' }
  | { state: 'synced'; at: number }
  | { state: 'error'; code: string; message: string }

export type ConnectionState =
  | { state: 'connecting' }
  | { state: 'connected'; runtimeId: string }
  | { state: 'reconnecting'; attempt: number; nextRetryInMs: number }
  | { state: 'down'; reason: string }

export type SceneState = {
  graph: WorktreeGraph
  sync: SyncStatus
  connection: ConnectionState
  selection: { selectedId: WorktreeId | null }
  terminals: TerminalsState
  spawnMenu: SpawnMenuSlice
  repos: ReposSlice
  projectSelector: ProjectSelectorSlice
  commandPalette: CommandPaletteSlice
  fanOut: FanOutSlice
}

export type SceneStore = {
  get(): SceneState
  set(next: SceneState): void
  update(patch: Partial<SceneState>): void
  /** Drives the terminals slice through terminal-session-model's pure reducer, one notify. */
  dispatchTerminal(action: TerminalAction): void
  /** Drives the spawnMenu slice through spawn-menu-model's pure reducer, one notify. */
  dispatchSpawn(action: SpawnMenuAction): void
  /** Drives the repos slice through repos-model's pure reducer, one notify. */
  dispatchRepos(action: ReposAction): void
  /** Drives the projectSelector slice through project-selector-model's pure reducer, one notify. */
  dispatchProjectSelector(action: ProjectSelectorAction): void
  /** Drives the commandPalette slice through command-palette-model's pure reducer, one notify. */
  dispatchCommandPalette(action: CommandPaletteAction): void
  /** Drives the fanOut slice through fan-out-model's reducer and recomposes graph, one notify. */
  dispatchFanOut(action: FanOutAction): void
  subscribe(listener: (state: SceneState) => void): () => void
}

const initialSceneState = (): SceneState => ({
  graph: emptyWorktreeGraph(),
  sync: { state: 'idle' },
  connection: { state: 'down', reason: 'not connected' },
  selection: { selectedId: null },
  terminals: emptyTerminalsState(),
  spawnMenu: emptySpawnMenuSlice(),
  repos: emptyReposSlice(),
  projectSelector: emptyProjectSelectorSlice(),
  commandPalette: emptyCommandPaletteSlice(),
  fanOut: emptyFanOutSlice()
})

/** Minimal observable store; swap for a richer signal system when the UI grows. */
export function createSceneStore(): SceneStore {
  let state: SceneState = initialSceneState()
  const listeners = new Set<(state: SceneState) => void>()
  const notify = (): void => {
    for (const listener of [...listeners]) {
      listener(state)
    }
  }
  return {
    get: () => state,
    set(next) {
      state = next
      notify()
    },
    update(patch) {
      state = { ...state, ...patch }
      notify()
    },
    dispatchTerminal(action) {
      state = { ...state, terminals: reduceTerminals(state.terminals, action) }
      notify()
    },
    dispatchSpawn(action) {
      state = { ...state, spawnMenu: reduceSpawnMenu(state.spawnMenu, action) }
      notify()
    },
    dispatchRepos(action) {
      state = { ...state, repos: reduceRepos(state.repos, action) }
      notify()
    },
    dispatchProjectSelector(action) {
      state = { ...state, projectSelector: reduceProjectSelector(state.projectSelector, action) }
      notify()
    },
    dispatchCommandPalette(action) {
      state = { ...state, commandPalette: reduceCommandPalette(state.commandPalette, action) }
      notify()
    },
    dispatchFanOut(action) {
      const fanOut = reduceFanOut(state.fanOut, action)
      state = { ...state, fanOut, graph: composeFanOutGraph(state.graph, fanOut) }
      notify()
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => void listeners.delete(listener)
    }
  }
}
