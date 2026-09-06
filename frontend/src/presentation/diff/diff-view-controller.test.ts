import { describe, expect, it, vi } from 'vitest'
import { createDiffViewController } from './diff-view-controller'
import type { DiffViewControllerDeps } from './diff-view-controller'
import { emptyDiffViewSlice, reduceDiffView } from '../../application/diff-view-model'
import type { DiffViewSlice } from '../../application/diff-view-model'
import type { ConnectionState } from '../../application/scene-store'
import type { DiffRailHandle } from './diff-rail-element'
import type { DiffPanelHandle } from './diff-panel-element'
import type { DiffHudHandle } from './diff-hud-element'

const CONNECTED: ConnectionState = { state: 'connected', runtimeId: 'rt-1' }

const createFakeRail = (): DiffRailHandle & {
  applyCalls: unknown[]
  disposed: boolean
  emitSelect(path: string): void
} => {
  let selectCb: ((path: string) => void) | null = null
  const handle = {
    root: {} as HTMLElement,
    applyCalls: [] as unknown[],
    disposed: false,
    apply: vi.fn((rows) => handle.applyCalls.push(rows)),
    onSelect: vi.fn((cb: (path: string) => void) => (selectCb = cb)),
    dispose: vi.fn(() => (handle.disposed = true)),
    emitSelect(path: string) {
      selectCb?.(path)
    }
  }
  return handle
}

const createFakePanel = (): DiffPanelHandle & { applyCalls: unknown[]; disposed: boolean } => {
  const handle = {
    element: {} as HTMLElement,
    applyCalls: [] as unknown[],
    disposed: false,
    apply: vi.fn((vm) => handle.applyCalls.push(vm)),
    dispose: vi.fn(() => (handle.disposed = true))
  }
  return handle
}

const createFakeHud = (): DiffHudHandle & { applyCalls: unknown[]; disposed: boolean } => {
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
  const rails: ReturnType<typeof createFakeRail>[] = []
  const panels: ReturnType<typeof createFakePanel>[] = []
  const huds: ReturnType<typeof createFakeHud>[] = []
  const hud = { appendChild: vi.fn() }
  const keyboardBarSlot = { appendChild: vi.fn() }
  const onEnter = vi.fn()
  const onExit = vi.fn()
  const onSelect = vi.fn()
  const deps: DiffViewControllerDeps = {
    createRail: () => {
      const r = createFakeRail()
      rails.push(r)
      return r
    },
    createPanel: () => {
      const p = createFakePanel()
      panels.push(p)
      return p
    },
    createHud: () => {
      const h = createFakeHud()
      huds.push(h)
      return h
    },
    hud,
    keyboardBarSlot,
    onSelect,
    onEnter,
    onExit
  }
  const controller = createDiffViewController(deps)
  return { controller, rails, panels, huds, hud, keyboardBarSlot, onEnter, onExit, onSelect }
}

const openSlice = (nodeId = 'router'): DiffViewSlice =>
  reduceDiffView(emptyDiffViewSlice(), { type: 'open', nodeId, baseRef: 'main' })

describe('createDiffViewController', () => {
  it('does nothing while closed', () => {
    const { controller, rails } = setup()
    controller.sync(emptyDiffViewSlice(), CONNECTED, 'main')
    expect(rails).toHaveLength(0)
  })

  it('mounts rail/panel/hud into the #diff slot and the keyboard bar into its own slot on open', () => {
    const { controller, rails, panels, huds, hud, keyboardBarSlot } = setup()
    controller.sync(openSlice(), CONNECTED, 'main')
    expect(rails).toHaveLength(1)
    expect(panels).toHaveLength(1)
    expect(huds).toHaveLength(1)
    expect(hud.appendChild).toHaveBeenCalledWith(huds[0]!.root)
    expect(hud.appendChild).toHaveBeenCalledWith(rails[0]!.root)
    expect(hud.appendChild).toHaveBeenCalledWith(panels[0]!.element)
    expect(keyboardBarSlot.appendChild).toHaveBeenCalledWith(huds[0]!.keyboardBar.root)
  })

  it('calls onEnter once on the closed->open transition, not again on a later open sync', () => {
    const { controller, onEnter } = setup()
    controller.sync(openSlice(), CONNECTED, 'main')
    controller.sync(openSlice(), CONNECTED, 'main')
    expect(onEnter).toHaveBeenCalledOnce()
  })

  it('applies the rail/panel/hud view-models derived from the slice each sync', () => {
    const { controller, rails, panels, huds } = setup()
    let slice = openSlice('router')
    slice = reduceDiffView(slice, {
      type: 'rail-loaded',
      compare: { headOid: 'abc', mergeBase: 'def' },
      files: [{ path: 'a.ts', status: 'modified', added: 3, removed: 1 }]
    })
    controller.sync(slice, CONNECTED, 'main')

    expect(rails[0]!.applyCalls).toHaveLength(1)
    expect(rails[0]!.applyCalls[0]).toMatchObject([{ path: 'a.ts' }])
    expect(panels[0]!.applyCalls[0]).toMatchObject({ kind: 'idle' })
    expect(huds[0]!.applyCalls[0]).toMatchObject({ connection: CONNECTED, branch: 'main' })
  })

  it('forwards a rail onSelect click to deps.onSelect', () => {
    const { controller, rails, onSelect } = setup()
    controller.sync(openSlice(), CONNECTED, 'main')
    rails[0]!.emitSelect('a.ts')
    expect(onSelect).toHaveBeenCalledWith('a.ts')
  })

  it('does not remount on a second open sync — same instances, apply called again', () => {
    const { controller, rails, panels, huds } = setup()
    controller.sync(openSlice(), CONNECTED, 'main')
    controller.sync(openSlice(), CONNECTED, 'main')
    expect(rails).toHaveLength(1)
    expect(panels).toHaveLength(1)
    expect(huds).toHaveLength(1)
    expect(rails[0]!.apply).toHaveBeenCalledTimes(2)
  })

  it('unmounts and calls onExit on close', () => {
    const { controller, rails, panels, huds, onExit } = setup()
    controller.sync(openSlice(), CONNECTED, 'main')
    controller.sync(emptyDiffViewSlice(), CONNECTED, 'main')
    expect(rails[0]!.disposed).toBe(true)
    expect(panels[0]!.disposed).toBe(true)
    expect(huds[0]!.disposed).toBe(true)
    expect(onExit).toHaveBeenCalledOnce()
  })

  it('a second closed sync after unmount is idempotent — onExit not called again', () => {
    const { controller, onExit } = setup()
    controller.sync(openSlice(), CONNECTED, 'main')
    controller.sync(emptyDiffViewSlice(), CONNECTED, 'main')
    controller.sync(emptyDiffViewSlice(), CONNECTED, 'main')
    expect(onExit).toHaveBeenCalledOnce()
  })

  it('reopening after a close mounts fresh instances and calls onEnter again', () => {
    const { controller, rails, onEnter } = setup()
    controller.sync(openSlice(), CONNECTED, 'main')
    controller.sync(emptyDiffViewSlice(), CONNECTED, 'main')
    controller.sync(openSlice(), CONNECTED, 'main')
    expect(rails).toHaveLength(2)
    expect(onEnter).toHaveBeenCalledTimes(2)
  })

  it('dispose() unmounts whatever is currently mounted', () => {
    const { controller, rails, panels, huds } = setup()
    controller.sync(openSlice(), CONNECTED, 'main')
    controller.dispose()
    expect(rails[0]!.disposed).toBe(true)
    expect(panels[0]!.disposed).toBe(true)
    expect(huds[0]!.disposed).toBe(true)
  })
})
