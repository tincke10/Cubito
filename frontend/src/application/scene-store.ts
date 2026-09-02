import { emptyWorktreeGraph } from '../domain/worktree-graph/types'
import type { WorktreeGraph, WorktreeId } from '../domain/worktree-graph/types'

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
}

export type SceneStore = {
  get(): SceneState
  set(next: SceneState): void
  update(patch: Partial<SceneState>): void
  subscribe(listener: (state: SceneState) => void): () => void
}

const initialSceneState = (): SceneState => ({
  graph: emptyWorktreeGraph(),
  sync: { state: 'idle' },
  connection: { state: 'down', reason: 'not connected' },
  selection: { selectedId: null },
  repo: null
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
    subscribe(listener) {
      listeners.add(listener)
      return () => void listeners.delete(listener)
    }
  }
}
