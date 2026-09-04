import { describe, expect, it, vi } from 'vitest'
import { createSceneStore } from './scene-store'
import { emptyWorktreeGraph } from '../domain/worktree-graph/types'
import { emptyTerminalsState } from './terminal-session-model'
import { emptySpawnMenuSlice } from './spawn-menu-model'
import { emptyReposSlice } from './repos-model'

describe('createSceneStore', () => {
  it('starts idle with an empty graph and no connection/selection', () => {
    const store = createSceneStore()
    const state = store.get()
    expect(state.sync).toEqual({ state: 'idle' })
    expect(state.graph.nodes.size).toBe(0)
    expect(state.selection).toEqual({ selectedId: null })
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
    store.update({
      sync: { state: 'synced', at: 1 },
      connection: { state: 'down', reason: 'offline' }
    })
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
    expect(store.get().connection).toEqual({
      state: 'reconnecting',
      attempt: 3,
      nextRetryInMs: 2000
    })

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

  it('starts with an empty terminals slice', () => {
    const store = createSceneStore()
    expect(store.get().terminals).toEqual(emptyTerminalsState())
  })

  it('dispatchTerminal() drives the terminals slice through the reducer', () => {
    const store = createSceneStore()
    store.dispatchTerminal({ type: 'open-terminal-for-node', nodeId: 'w1' })
    const state = store.get()
    expect(state.terminals.sessions.get(1)).toMatchObject({ nodeId: 'w1', status: 'creating' })
    expect(state.terminals.activePanel).toMatchObject({ nodeId: 'w1', sessionIndex: 0 })
  })

  it('dispatchTerminal() notifies subscribers and leaves the rest of SceneState untouched', () => {
    const store = createSceneStore()
    const listener = vi.fn()
    store.subscribe(listener)
    const before = store.get()
    store.dispatchTerminal({ type: 'open-terminal-for-node', nodeId: 'w1' })
    expect(listener).toHaveBeenCalledTimes(1)
    const after = store.get()
    expect(after.graph).toBe(before.graph)
    expect(after.connection).toBe(before.connection)
    expect(after.terminals).not.toBe(before.terminals)
  })

  it('dispatchTerminal() accumulates across multiple actions', () => {
    const store = createSceneStore()
    store.dispatchTerminal({ type: 'open-terminal-for-node', nodeId: 'w1' })
    store.dispatchTerminal({
      type: 'subscribed',
      streamId: 1,
      terminal: 'term-1',
      cols: 80,
      rows: 24
    })
    store.dispatchTerminal({ type: 'output-arrived', streamId: 1 })
    expect(store.get().terminals.sessions.get(1)).toMatchObject({
      handle: 'term-1',
      status: 'live',
      hasOutput: true
    })
  })

  it('starts with a closed spawn menu slice', () => {
    const store = createSceneStore()
    expect(store.get().spawnMenu).toEqual(emptySpawnMenuSlice())
  })

  it('dispatchSpawn() drives the spawnMenu slice through the reducer', () => {
    const store = createSceneStore()
    store.dispatchSpawn({ type: 'open-for-node', nodeId: 'w1' })
    expect(store.get().spawnMenu).toEqual({ view: 'radial', nodeId: 'w1', repoSelector: null })
  })

  it('dispatchSpawn() notifies subscribers once and leaves the rest of SceneState untouched', () => {
    const store = createSceneStore()
    const listener = vi.fn()
    store.subscribe(listener)
    const before = store.get()
    store.dispatchSpawn({ type: 'open-for-node', nodeId: 'w1' })
    expect(listener).toHaveBeenCalledTimes(1)
    const after = store.get()
    expect(after.graph).toBe(before.graph)
    expect(after.terminals).toBe(before.terminals)
    expect(after.spawnMenu).not.toBe(before.spawnMenu)
  })

  it('starts with an empty repos slice', () => {
    const store = createSceneStore()
    expect(store.get().repos).toEqual(emptyReposSlice())
  })

  it('dispatchRepos() drives the repos slice through the reducer', () => {
    const store = createSceneStore()
    const repo = { id: 'r1', path: '/r1', displayName: 'R1', kind: 'git' as const }
    store.dispatchRepos({ type: 'set-list', list: [repo] })
    expect(store.get().repos).toEqual({ list: [repo], activeRepoId: 'r1' })
  })

  it('dispatchRepos() notifies subscribers once and leaves the rest of SceneState untouched', () => {
    const store = createSceneStore()
    const listener = vi.fn()
    store.subscribe(listener)
    const before = store.get()
    store.dispatchRepos({ type: 'set-list', list: [] })
    expect(listener).toHaveBeenCalledTimes(1)
    const after = store.get()
    expect(after.graph).toBe(before.graph)
    expect(after.spawnMenu).toBe(before.spawnMenu)
    expect(after.repos).not.toBe(before.repos)
  })
})
