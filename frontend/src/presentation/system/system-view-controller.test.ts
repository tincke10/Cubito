import { describe, expect, it, vi } from 'vitest'
import { createSystemViewController } from './system-view-controller'
import type { SystemViewControllerDeps } from './system-view-controller'
import { emptySystemViewSlice, reduceSystemView } from '../../application/system-view-model'
import type { SystemViewSlice } from '../../application/system-view-model'
import type { ConnectionState } from '../../application/scene-store'
import type { SystemGraphHandle } from './system-graph-element'
import type { ActivityFeedHandle } from './activity-feed-element'
import type { SystemHudHandle } from './system-hud-element'

const CONNECTED: ConnectionState = { state: 'connected', runtimeId: 'rt-1' }

const createFakeGraph = (): SystemGraphHandle & { applyCalls: unknown[]; disposed: boolean } => {
  const handle = {
    element: {} as SystemGraphHandle['element'],
    applyCalls: [] as unknown[],
    disposed: false,
    apply: vi.fn((model) => handle.applyCalls.push(model)),
    dispose: vi.fn(() => (handle.disposed = true))
  }
  return handle
}

const createFakeFeed = (): ActivityFeedHandle & { applyCalls: unknown[]; disposed: boolean } => {
  const handle = {
    element: {} as HTMLElement,
    applyCalls: [] as unknown[],
    disposed: false,
    apply: vi.fn((rows) => handle.applyCalls.push(rows)),
    setSubtitle: vi.fn(),
    dispose: vi.fn(() => (handle.disposed = true))
  }
  return handle
}

const createFakeHud = (): SystemHudHandle & { applyCalls: unknown[]; disposed: boolean } => {
  const keyboardBar = { root: {} as HTMLElement, apply: vi.fn(), dispose: vi.fn() }
  const handle = {
    root: {} as HTMLElement,
    keyboardBar,
    applyCalls: [] as unknown[],
    disposed: false,
    apply: vi.fn((model) => handle.applyCalls.push(model)),
    dispose: vi.fn(() => (handle.disposed = true))
  }
  return handle
}

const setup = () => {
  const graphs: ReturnType<typeof createFakeGraph>[] = []
  const feeds: ReturnType<typeof createFakeFeed>[] = []
  const huds: ReturnType<typeof createFakeHud>[] = []
  const hud = { appendChild: vi.fn() }
  const keyboardBarSlot = { appendChild: vi.fn() }
  const onEnter = vi.fn()
  const onExit = vi.fn()
  const deps: SystemViewControllerDeps = {
    createGraph: () => {
      const g = createFakeGraph()
      graphs.push(g)
      return g
    },
    createFeed: () => {
      const f = createFakeFeed()
      feeds.push(f)
      return f
    },
    createHud: () => {
      const h = createFakeHud()
      huds.push(h)
      return h
    },
    hud,
    keyboardBarSlot,
    onEnter,
    onExit
  }
  const controller = createSystemViewController(deps)
  return { controller, graphs, feeds, huds, hud, keyboardBarSlot, onEnter, onExit }
}

const openSlice = (nodeId = 'router'): SystemViewSlice =>
  reduceSystemView(emptySystemViewSlice(), { type: 'open', nodeId })

describe('createSystemViewController', () => {
  it('does nothing while closed', () => {
    const { controller, graphs } = setup()
    controller.sync(emptySystemViewSlice(), CONNECTED, 'main')
    expect(graphs).toHaveLength(0)
  })

  it('mounts graph/feed/hud into the #system slot and the keyboard bar into its own slot on open', () => {
    const { controller, graphs, feeds, huds, hud, keyboardBarSlot } = setup()
    controller.sync(openSlice(), CONNECTED, 'main')
    expect(graphs).toHaveLength(1)
    expect(feeds).toHaveLength(1)
    expect(huds).toHaveLength(1)
    expect(hud.appendChild).toHaveBeenCalledWith(huds[0]!.root)
    expect(hud.appendChild).toHaveBeenCalledWith(graphs[0]!.element)
    expect(hud.appendChild).toHaveBeenCalledWith(feeds[0]!.element)
    expect(keyboardBarSlot.appendChild).toHaveBeenCalledWith(huds[0]!.keyboardBar.root)
  })

  it('calls onEnter once on the closed->open transition, not again on a later open sync', () => {
    const { controller, onEnter } = setup()
    controller.sync(openSlice(), CONNECTED, 'main')
    controller.sync(openSlice(), CONNECTED, 'main')
    expect(onEnter).toHaveBeenCalledOnce()
  })

  it('applies the graph/feed/hud view-models derived from the slice each sync', () => {
    const { controller, graphs, feeds, huds } = setup()
    let slice = openSlice('router')
    slice = reduceSystemView(slice, {
      type: 'append-feed',
      row: { id: 'f1', time: '10:00', kind: 'read', text: 'leyó algo' }
    })
    controller.sync(slice, CONNECTED, 'main')

    expect(graphs[0]!.applyCalls).toHaveLength(1)
    expect(feeds[0]!.applyCalls[0]).toMatchObject([{ id: 'f1', text: 'leyó algo' }])
    expect(huds[0]!.applyCalls[0]).toMatchObject({ connection: CONNECTED, branch: 'main' })
  })

  it('does not remount on a second open sync — same instances, apply called again', () => {
    const { controller, graphs, feeds, huds } = setup()
    controller.sync(openSlice(), CONNECTED, 'main')
    controller.sync(openSlice(), CONNECTED, 'main')
    expect(graphs).toHaveLength(1)
    expect(feeds).toHaveLength(1)
    expect(huds).toHaveLength(1)
    expect(graphs[0]!.apply).toHaveBeenCalledTimes(2)
  })

  it('unmounts and calls onExit on close', () => {
    const { controller, graphs, feeds, huds, onExit } = setup()
    controller.sync(openSlice(), CONNECTED, 'main')
    controller.sync(emptySystemViewSlice(), CONNECTED, 'main')
    expect(graphs[0]!.disposed).toBe(true)
    expect(feeds[0]!.disposed).toBe(true)
    expect(huds[0]!.disposed).toBe(true)
    expect(onExit).toHaveBeenCalledOnce()
  })

  it('a second closed sync after unmount is idempotent — onExit not called again', () => {
    const { controller, onExit } = setup()
    controller.sync(openSlice(), CONNECTED, 'main')
    controller.sync(emptySystemViewSlice(), CONNECTED, 'main')
    controller.sync(emptySystemViewSlice(), CONNECTED, 'main')
    expect(onExit).toHaveBeenCalledOnce()
  })

  it('reopening after a close mounts fresh instances and calls onEnter again', () => {
    const { controller, graphs, onEnter } = setup()
    controller.sync(openSlice(), CONNECTED, 'main')
    controller.sync(emptySystemViewSlice(), CONNECTED, 'main')
    controller.sync(openSlice(), CONNECTED, 'main')
    expect(graphs).toHaveLength(2)
    expect(onEnter).toHaveBeenCalledTimes(2)
  })

  it('dispose() unmounts whatever is currently mounted', () => {
    const { controller, graphs, feeds, huds } = setup()
    controller.sync(openSlice(), CONNECTED, 'main')
    controller.dispose()
    expect(graphs[0]!.disposed).toBe(true)
    expect(feeds[0]!.disposed).toBe(true)
    expect(huds[0]!.disposed).toBe(true)
  })
})
