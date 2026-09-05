import { describe, expect, it, vi } from 'vitest'
import { createCommandPaletteController } from './command-palette-controller'
import type { CommandPaletteControllerDeps } from './command-palette-controller'
import { createSceneStore } from '../../application/scene-store'
import type { CommandId } from '../../application/command-catalog'
import type { CommandPaletteHandle } from './command-palette-element'
import type { CommandPaletteViewModel } from './command-palette-view-model'
import { frameAll, frameNode } from '../camera/camera-framing'
import type { Vec3 } from '../camera/camera-framing'
import { FOCUS_DURATION_MS } from '../theme/scene-metrics'
import { inertActivity } from '../../domain/worktree-graph/node-activity'
import type { WorktreeGraph, WorktreeNode } from '../../domain/worktree-graph/types'

type FakeHandle = CommandPaletteHandle & {
  applyCalls: number
  lastModel: CommandPaletteViewModel
  disposed: boolean
  focused: boolean
  emitQueryChange(query: string): void
  emitHighlight(delta: number): void
  emitActivate(id: CommandId): void
  emitClose(): void
}

const createFakeHandle = (): FakeHandle => {
  let queryCb: ((query: string) => void) | null = null
  let highlightCb: ((delta: number) => void) | null = null
  let activateCb: ((id: CommandId) => void) | null = null
  let closeCb: (() => void) | null = null

  const handle: FakeHandle = {
    element: {} as HTMLElement,
    applyCalls: 0,
    lastModel: null,
    disposed: false,
    focused: false,
    apply: vi.fn((model: CommandPaletteViewModel) => {
      handle.applyCalls++
      handle.lastModel = model
    }),
    onQueryChange(cb) {
      queryCb = cb
      return () => (queryCb = null)
    },
    onHighlight(cb) {
      highlightCb = cb
      return () => (highlightCb = null)
    },
    onActivate(cb) {
      activateCb = cb
      return () => (activateCb = null)
    },
    onClose(cb) {
      closeCb = cb
      return () => (closeCb = null)
    },
    focusQuery: vi.fn(() => (handle.focused = true)),
    dispose: vi.fn(() => (handle.disposed = true)),
    emitQueryChange(query) {
      queryCb?.(query)
    },
    emitHighlight(delta) {
      highlightCb?.(delta)
    },
    emitActivate(id) {
      activateCb?.(id)
    },
    emitClose() {
      closeCb?.()
    }
  }
  return handle
}

const node = (id: string, parentId: string | null, childIds: readonly string[]): WorktreeNode => ({
  id,
  repoId: 'repo',
  branch: id,
  path: `/tmp/${id}`,
  status: 'clean',
  isMain: parentId === null,
  kind: parentId === null ? 'root' : 'worktree',
  parentId,
  childIds,
  activity: inertActivity()
})

function buildGraph(): WorktreeGraph {
  const nodes = new Map<string, WorktreeNode>([
    ['root', node('root', null, ['a'])],
    ['a', node('a', 'root', [])]
  ])
  return { nodes, edges: [], rootIds: ['root'] }
}

const CENTERS: Record<string, Vec3> = {
  root: { x: 0, y: 0, z: 0 },
  a: { x: -5, y: 0, z: 0 }
}

const LINUX = { isMac: false }

function setup(selectedId: string | null = 'a', connected = true) {
  const store = createSceneStore()
  store.update({
    graph: buildGraph(),
    selection: { selectedId },
    connection: connected ? { state: 'connected', runtimeId: 'r' } : { state: 'down', reason: 'x' }
  })
  const cameraRig = { animateTo: vi.fn() }
  const scenePositions = {
    nodeCenter: (id: string) => CENTERS[id] ?? null,
    nodeCenters: () => Object.values(CENTERS)
  }
  const terminal = { focusActivePanel: vi.fn() }
  const hud = { appendChild: vi.fn() }
  const handles: FakeHandle[] = []
  const deps: CommandPaletteControllerDeps = {
    store,
    cameraRig,
    scenePositions,
    terminal,
    createElement: () => {
      const h = createFakeHandle()
      handles.push(h)
      return h
    },
    hud,
    platform: LINUX
  }
  const controller = createCommandPaletteController(deps)
  return { store, cameraRig, scenePositions, terminal, hud, handles, controller }
}

const openAndMount = (setupResult: ReturnType<typeof setup>): void => {
  setupResult.store.dispatchCommandPalette({ type: 'open' })
  setupResult.controller.sync(setupResult.store.get().commandPalette, setupResult.store.get())
}

describe('createCommandPaletteController', () => {
  it('does nothing when the slice is closed', () => {
    const { controller, store, handles } = setup()
    controller.sync(store.get().commandPalette, store.get())
    expect(handles).toHaveLength(0)
  })

  it('mounts into the hud, applies the view model, and focuses the query on open', () => {
    const setupResult = setup()
    openAndMount(setupResult)
    expect(setupResult.handles).toHaveLength(1)
    expect(setupResult.hud.appendChild).toHaveBeenCalledWith(setupResult.handles[0]!.element)
    expect(setupResult.handles[0]!.applyCalls).toBe(1)
    expect(setupResult.handles[0]!.focused).toBe(true)
  })

  it('unmounts when closing', () => {
    const setupResult = setup()
    openAndMount(setupResult)
    setupResult.store.dispatchCommandPalette({ type: 'close' })
    setupResult.controller.sync(setupResult.store.get().commandPalette, setupResult.store.get())
    expect(setupResult.handles[0]!.disposed).toBe(true)
  })

  it('wires query/highlight changes from the element to the store', () => {
    const setupResult = setup()
    openAndMount(setupResult)
    setupResult.handles[0]!.emitQueryChange('foc')
    expect(setupResult.store.get().commandPalette).toMatchObject({ query: 'foc' })
    setupResult.handles[0]!.emitHighlight(1)
    expect(setupResult.store.get().commandPalette).toMatchObject({ highlightedIndex: 1 })
  })

  it('onClose from the element closes the palette', () => {
    const setupResult = setup()
    openAndMount(setupResult)
    setupResult.handles[0]!.emitClose()
    expect(setupResult.store.get().commandPalette.view).toBe('closed')
  })

  describe('activate — close-then-run for every command', () => {
    it('focus frames the selected node through cameraRig.animateTo, and closes the palette first', () => {
      const setupResult = setup('a')
      openAndMount(setupResult)
      setupResult.handles[0]!.emitActivate('focus')
      expect(setupResult.store.get().commandPalette.view).toBe('closed')
      expect(setupResult.cameraRig.animateTo).toHaveBeenCalledWith(
        frameNode(CENTERS.a!),
        FOCUS_DURATION_MS
      )
    })

    it('focus with no selection is a no-op (still closes the palette)', () => {
      const setupResult = setup(null)
      openAndMount(setupResult)
      setupResult.handles[0]!.emitActivate('focus')
      expect(setupResult.cameraRig.animateTo).not.toHaveBeenCalled()
    })

    it('fit-all frames every node', () => {
      const setupResult = setup('a')
      openAndMount(setupResult)
      setupResult.handles[0]!.emitActivate('fit-all')
      expect(setupResult.cameraRig.animateTo).toHaveBeenCalledWith(
        frameAll(setupResult.scenePositions.nodeCenters()),
        FOCUS_DURATION_MS
      )
    })

    it('open-terminal opens a terminal for the selected node and focuses the panel', () => {
      const setupResult = setup('a')
      openAndMount(setupResult)
      setupResult.handles[0]!.emitActivate('open-terminal')
      expect(setupResult.store.get().terminals.activePanel).toMatchObject({ nodeId: 'a' })
      expect(setupResult.terminal.focusActivePanel).toHaveBeenCalledOnce()
    })

    it('open-terminal on an already-open node just refocuses it', () => {
      const setupResult = setup('a')
      setupResult.store.dispatchTerminal({ type: 'open-terminal-for-node', nodeId: 'a' })
      setupResult.store.dispatchTerminal({ type: 'set-focused', focused: false })
      openAndMount(setupResult)
      setupResult.handles[0]!.emitActivate('open-terminal')
      expect(setupResult.store.get().terminals.byNode.get('a')).toHaveLength(1)
      expect(setupResult.store.get().terminals.activePanel?.focused).toBe(true)
    })

    it('open-spawn with a node selected opens the radial/spawn flow for it, closing the palette first', () => {
      const setupResult = setup('a')
      openAndMount(setupResult)
      setupResult.handles[0]!.emitActivate('open-spawn')
      expect(setupResult.store.get().spawnMenu).toMatchObject({ nodeId: 'a' })
    })

    it('open-spawn with no node selected opens the rootless form', () => {
      const setupResult = setup(null)
      openAndMount(setupResult)
      setupResult.handles[0]!.emitActivate('open-spawn')
      expect(setupResult.store.get().spawnMenu).toMatchObject({ view: 'form', parentId: null })
    })

    it('open-projects opens the selector and closes the palette', () => {
      const setupResult = setup('a')
      openAndMount(setupResult)
      setupResult.handles[0]!.emitActivate('open-projects')
      expect(setupResult.store.get().projectSelector.view).toBe('open')
      expect(setupResult.store.get().commandPalette.view).toBe('closed')
    })

    it('add-repo opens the selector directly into the add-form, closing the palette', () => {
      const setupResult = setup('a')
      openAndMount(setupResult)
      setupResult.handles[0]!.emitActivate('add-repo')
      expect(setupResult.store.get().projectSelector.view).toBe('add-form')
      expect(setupResult.store.get().commandPalette.view).toBe('closed')
    })

    it('fan-out dispatches the fan-out open action for the selected node, closing the palette first', () => {
      const setupResult = setup('a')
      openAndMount(setupResult)
      setupResult.handles[0]!.emitActivate('fan-out')
      expect(setupResult.store.get().commandPalette.view).toBe('closed')
      expect(setupResult.store.get().fanOut).toMatchObject({ view: 'form', parentId: 'a' })
    })

    it('fan-out with nothing selected is a no-op (guard; upstream isAvailable already gates it)', () => {
      const setupResult = setup(null)
      openAndMount(setupResult)
      const before = setupResult.store.get()
      setupResult.handles[0]!.emitActivate('fan-out')
      expect(setupResult.store.get().fanOut).toBe(before.fanOut)
    })

    it('activating a currently-disabled command no-ops entirely (guard, belt-and-suspenders)', () => {
      const setupResult = setup(null, false) // no selection, not connected
      openAndMount(setupResult)
      setupResult.handles[0]!.emitActivate('open-terminal') // needs hasSelection && isConnected
      expect(setupResult.store.get().commandPalette.view).toBe('open') // never closed — guard returned early
      expect(setupResult.terminal.focusActivePanel).not.toHaveBeenCalled()
    })
  })

  it('dispose unmounts whatever is currently mounted', () => {
    const setupResult = setup()
    openAndMount(setupResult)
    setupResult.controller.dispose()
    expect(setupResult.handles[0]!.disposed).toBe(true)
  })
})
