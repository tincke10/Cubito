import { emptyWorktreeGraph } from '../domain/worktree-graph/types'
import type { WorktreeGraph } from '../domain/worktree-graph/types'

export type SyncStatus =
  | { state: 'idle' }
  | { state: 'syncing' }
  | { state: 'synced'; at: number }
  | { state: 'error'; code: string; message: string }

export type GraphState = {
  graph: WorktreeGraph
  sync: SyncStatus
}

export type GraphStore = {
  get(): GraphState
  set(next: GraphState): void
  subscribe(listener: (state: GraphState) => void): () => void
}

/** Minimal observable store; swap for a richer signal system when the UI grows. */
export function createGraphStore(): GraphStore {
  let state: GraphState = { graph: emptyWorktreeGraph(), sync: { state: 'idle' } }
  const listeners = new Set<(state: GraphState) => void>()
  return {
    get: () => state,
    set(next) {
      state = next
      for (const listener of [...listeners]) {
        listener(state)
      }
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => void listeners.delete(listener)
    }
  }
}
