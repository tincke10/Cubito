import { describe, expect, it, vi } from 'vitest'
import { createSceneStore } from './scene-store'
import { emptyWorktreeGraph } from '../domain/worktree-graph/types'

describe('createSceneStore', () => {
  it('starts idle with an empty graph and no connection/selection', () => {
    const store = createSceneStore()
    const state = store.get()
    expect(state.sync).toEqual({ state: 'idle' })
    expect(state.graph.nodes.size).toBe(0)
    expect(state.selection).toEqual({ selectedId: null })
    expect(state.repo).toBeNull()
  })

  it('notifies subscribers on set', () => {
    const store = createSceneStore()
    const listener = vi.fn()
    store.subscribe(listener)
    store.set({ ...store.get(), sync: { state: 'syncing' } })
    expect(listener).toHaveBeenCalledTimes(1)
    expect(store.get().sync).toEqual({ state: 'syncing' })
  })

  it('stops notifying after unsubscribe', () => {
    const store = createSceneStore()
    const listener = vi.fn()
    const unsubscribe = store.subscribe(listener)
    unsubscribe()
    store.set({ ...store.get(), sync: { state: 'idle' } })
    expect(listener).not.toHaveBeenCalled()
  })

  it('update() shallow-merges the patch, preserving untouched fields', () => {
    const store = createSceneStore()
    const before = store.get()
    store.update({ selection: { selectedId: 'x' } })
    const after = store.get()
    expect(after.selection).toEqual({ selectedId: 'x' })
    expect(after.graph).toBe(before.graph)
    expect(after.sync).toBe(before.sync)
    expect(after.connection).toBe(before.connection)
    expect(after.repo).toBe(before.repo)
  })

  it('notifies subscribers on update()', () => {
    const store = createSceneStore()
    const listener = vi.fn()
    store.subscribe(listener)
    store.update({ sync: { state: 'syncing' } })
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('sync and connection are independently settable', () => {
    const store = createSceneStore()
    store.update({ sync: { state: 'synced', at: 1 }, connection: { state: 'down', reason: 'offline' } })
    const state = store.get()
    expect(state.sync).toEqual({ state: 'synced', at: 1 })
    expect(state.connection).toEqual({ state: 'down', reason: 'offline' })

    store.update({ connection: { state: 'connected', runtimeId: 'rt-1' } })
    const next = store.get()
    expect(next.sync).toEqual({ state: 'synced', at: 1 })
    expect(next.connection).toEqual({ state: 'connected', runtimeId: 'rt-1' })
  })

  it('round-trips the connecting and reconnecting connection states', () => {
    const store = createSceneStore()

    store.update({ connection: { state: 'connecting' } })
    expect(store.get().connection).toEqual({ state: 'connecting' })

    store.update({ connection: { state: 'reconnecting', attempt: 3, nextRetryInMs: 2000 } })
    expect(store.get().connection).toEqual({ state: 'reconnecting', attempt: 3, nextRetryInMs: 2000 })

    store.set({ ...store.get(), connection: { state: 'connecting' } })
    expect(store.get().connection).toEqual({ state: 'connecting' })
  })

  it('has no counters field anywhere on SceneState', () => {
    const store = createSceneStore()
    const state = store.get()
    expect('counters' in state).toBe(false)

    store.update({ graph: emptyWorktreeGraph() })
    expect('counters' in store.get()).toBe(false)
  })
})
