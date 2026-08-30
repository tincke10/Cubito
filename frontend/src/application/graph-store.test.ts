import { describe, expect, it, vi } from 'vitest'
import { createGraphStore } from './graph-store'
import { emptyWorktreeGraph } from '../domain/worktree-graph/types'

describe('createGraphStore', () => {
  it('starts idle with an empty graph', () => {
    const store = createGraphStore()
    expect(store.get().sync).toEqual({ state: 'idle' })
    expect(store.get().graph.nodes.size).toBe(0)
  })

  it('notifies subscribers on set', () => {
    const store = createGraphStore()
    const listener = vi.fn()
    store.subscribe(listener)
    store.set({ graph: emptyWorktreeGraph(), sync: { state: 'syncing' } })
    expect(listener).toHaveBeenCalledTimes(1)
    expect(store.get().sync).toEqual({ state: 'syncing' })
  })

  it('stops notifying after unsubscribe', () => {
    const store = createGraphStore()
    const listener = vi.fn()
    const unsubscribe = store.subscribe(listener)
    unsubscribe()
    store.set({ graph: emptyWorktreeGraph(), sync: { state: 'idle' } })
    expect(listener).not.toHaveBeenCalled()
  })
})
