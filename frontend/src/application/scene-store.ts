import { emptyWorktreeGraph } from '../domain/worktree-graph/types'
import type { WorktreeGraph, WorktreeId } from '../domain/worktree-graph/types'
import { emptyTerminalsState, reduceTerminals } from './terminal-session-model'
import type { TerminalAction, TerminalsState } from './terminal-session-model'
import { emptySpawnMenuSlice, reduceSpawnMenu } from './spawn-menu-model'
import type { SpawnMenuAction, SpawnMenuSlice } from './spawn-menu-model'

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
  repo: { name: string; baseBranch: string } | null
  terminals: TerminalsState
  spawnMenu: SpawnMenuSlice
}

export type SceneStore = {
  get(): SceneState
  set(next: SceneState): void
  update(patch: Partial<SceneState>): void
  /** Drives the terminals slice through terminal-session-model's pure reducer, one notify. */
  dispatchTerminal(action: TerminalAction): void
  /** Drives the spawnMenu slice through spawn-menu-model's pure reducer, one notify. */
  dispatchSpawn(action: SpawnMenuAction): void
  subscribe(listener: (state: SceneState) => void): () => void
}

const initialSceneState = (): SceneState => ({
  graph: emptyWorktreeGraph(),
  sync: { state: 'idle' },
  connection: { state: 'down', reason: 'not connected' },
  selection: { selectedId: null },
  repo: null,
  terminals: emptyTerminalsState(),
  spawnMenu: emptySpawnMenuSlice()
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
    subscribe(listener) {
      listeners.add(listener)
      return () => void listeners.delete(listener)
    }
  }
}
