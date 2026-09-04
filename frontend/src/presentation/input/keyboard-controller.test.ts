import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import { createKeyboardController } from './keyboard-controller'
import type { KeyboardControllerEvent, ScenePositions } from './keyboard-controller'
import { createSceneStore } from '../../application/scene-store'
import { moveSelection } from '../navigation/selection-model'
import { frameAll, frameNode, isWithinFraming } from '../camera/camera-framing'
import type { Vec3 } from '../camera/camera-framing'
import { inertActivity } from '../../domain/worktree-graph/node-activity'
import type { WorktreeGraph, WorktreeNode } from '../../domain/worktree-graph/types'
import { FOCUS_DURATION_MS, NODE_SIZE } from '../theme/scene-metrics'

const node = (
  id: string,
  parentId: string | null,
  childIds: readonly string[],
  isMain = false
): WorktreeNode => ({
  id,
  repoId: 'repo',
  branch: id,
  path: `/tmp/${id}`,
  status: 'clean',
  isMain,
  kind: isMain ? 'root' : 'worktree',
  parentId,
  childIds,
  activity: inertActivity()
})

/** root -> [a, b, c] (fan of three, so clamp at the last/first sibling is exercisable). */
function buildFanGraph(): WorktreeGraph {
  const nodes = new Map<string, WorktreeNode>([
    ['root', node('root', null, ['a', 'b', 'c'], true)],
    ['a', node('a', 'root', [])],
    ['b', node('b', 'root', [])],
    ['c', node('c', 'root', [])]
  ])
  return { nodes, edges: [], rootIds: ['root'] }
}

const CENTERS: Record<string, Vec3> = {
  root: { x: 0, y: 0, z: 0 },
  a: { x: -5, y: 0, z: 0 },
  b: { x: 5, y: 0, z: 0 },
  c: { x: 0, y: 0, z: 5 }
}

function fakeScenePositions(): ScenePositions {
  return {
    nodeCenter: (id) => CENTERS[id] ?? null,
    nodeCenters: () => Object.values(CENTERS)
  }
}

function baseEvent(overrides: Partial<KeyboardControllerEvent>): KeyboardControllerEvent {
  return {
    key: '',
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    target: null,
    ...overrides
  }
}

function fakeTerminalCommandPort() {
  return { focusActivePanel: vi.fn(), closeActiveSession: vi.fn() }
}

function setup(selectedId: string | null = 'b') {
  const store = createSceneStore()
  store.update({ graph: buildFanGraph(), selection: { selectedId } })
  const cameraRig = { animateTo: vi.fn() }
  const scenePositions = fakeScenePositions()
  const terminal = fakeTerminalCommandPort()
  const controller = createKeyboardController({ store, cameraRig, scenePositions, terminal })
  return { store, cameraRig, scenePositions, terminal, controller }
}

describe('createKeyboardController', () => {
  it('h delegates to moveSelection for "parent" — no parent-lookup logic of its own', () => {
    const { store, controller } = setup('b')
    const graph = store.get().graph
    const expected = moveSelection(graph, 'b', 'parent')

    controller.handleKeyDown(baseEvent({ key: 'h' }))

    expect(store.get().selection.selectedId).toBe(expected)
  })

  it('l/j/k delegate entirely to moveSelection, including clamp at fan boundaries', () => {
    const { store, controller } = setup('c') // 'c' is the last sibling of the fan
    const graph = store.get().graph

    // next-sibling ('j') at the last sibling clamps to itself — proves no boundary
    // logic is duplicated in the controller; it matches moveSelection byte for byte.
    const expectedJ = moveSelection(graph, 'c', 'next-sibling')
    controller.handleKeyDown(baseEvent({ key: 'j' }))
    expect(store.get().selection.selectedId).toBe(expectedJ)
    expect(expectedJ).toBe('c')

    const expectedL = moveSelection(graph, store.get().selection.selectedId, 'child')
    controller.handleKeyDown(baseEvent({ key: 'l' }))
    expect(store.get().selection.selectedId).toBe(expectedL)

    const expectedK = moveSelection(graph, store.get().selection.selectedId, 'prev-sibling')
    controller.handleKeyDown(baseEvent({ key: 'k' }))
    expect(store.get().selection.selectedId).toBe(expectedK)
  })

  it('f frames the selected node through camera-rig.animateTo — no direct camera math here', () => {
    const { cameraRig, controller } = setup('a')

    controller.handleKeyDown(baseEvent({ key: 'f' }))

    expect(cameraRig.animateTo).toHaveBeenCalledTimes(1)
    expect(cameraRig.animateTo).toHaveBeenCalledWith(frameNode(CENTERS['a']!), FOCUS_DURATION_MS)
  })

  it('v fits every node through camera-rig.animateTo — no direct camera math here', () => {
    const { cameraRig, scenePositions, controller } = setup('a')

    controller.handleKeyDown(baseEvent({ key: 'v' }))

    expect(cameraRig.animateTo).toHaveBeenCalledTimes(1)
    expect(cameraRig.animateTo).toHaveBeenCalledWith(
      frameAll(scenePositions.nodeCenters()),
      FOCUS_DURATION_MS
    )
  })

  it('any modifier held resolves to null — zero store updates, zero camera calls', () => {
    const { store, cameraRig, controller } = setup('b')
    const before = store.get().selection.selectedId

    controller.handleKeyDown(baseEvent({ key: 'h', ctrlKey: true }))
    controller.handleKeyDown(baseEvent({ key: 'f', metaKey: true }))
    controller.handleKeyDown(baseEvent({ key: 'v', shiftKey: true }))
    controller.handleKeyDown(baseEvent({ key: 'l', altKey: true }))

    expect(store.get().selection.selectedId).toBe(before)
    expect(cameraRig.animateTo).not.toHaveBeenCalled()
  })

  it('an unmapped key is a no-op', () => {
    const { store, cameraRig, controller } = setup('b')
    const before = store.get().selection.selectedId

    controller.handleKeyDown(baseEvent({ key: 'q' }))

    expect(store.get().selection.selectedId).toBe(before)
    expect(cameraRig.animateTo).not.toHaveBeenCalled()
  })

  it('ignores keys while focus is inside a text-entry target (isTextEntryTarget guard)', () => {
    const { store, cameraRig, controller } = setup('b')
    const before = store.get().selection.selectedId

    controller.handleKeyDown(
      baseEvent({ key: 'h', target: { tagName: 'INPUT', isContentEditable: false } })
    )
    controller.handleKeyDown(
      baseEvent({ key: 'f', target: { tagName: 'DIV', isContentEditable: true } })
    )

    expect(store.get().selection.selectedId).toBe(before)
    expect(cameraRig.animateTo).not.toHaveBeenCalled()
  })

  it('still acts on a non-text DOM target', () => {
    const { store, controller } = setup('b')

    controller.handleKeyDown(
      baseEvent({ key: 'h', target: { tagName: 'DIV', isContentEditable: false } })
    )

    expect(store.get().selection.selectedId).toBe('root')
  })

  it('guard rail: an out-of-view selection change issues an implicit frameNode', () => {
    // Sanity check that the fixture actually exercises the boundary: framed tightly on
    // 'b', 'c' (10 units away — the fan's diameter) sits outside FOCUS_RADIUS(6)+NODE_SIZE margin.
    const tightFraming = frameNode(CENTERS.b!)
    expect(isWithinFraming(CENTERS.c!, tightFraming, NODE_SIZE)).toBe(false)

    const { store, cameraRig, controller } = setup('b')
    controller.handleKeyDown(baseEvent({ key: 'f' })) // establishes a tight framing on 'b'
    cameraRig.animateTo.mockClear()

    controller.handleKeyDown(baseEvent({ key: 'j' })) // b -> c: moves out of the current framing

    expect(store.get().selection.selectedId).toBe('c')
    expect(cameraRig.animateTo).toHaveBeenCalledWith(frameNode(CENTERS.c!), FOCUS_DURATION_MS)
  })

  it('attach()/detach() are a thin DOM wrapper — smoke-tested via a fake EventTarget', () => {
    const { controller } = setup('b')
    const fakeTarget = { addEventListener: vi.fn(), removeEventListener: vi.fn() }

    const detach = controller.attach(fakeTarget)

    expect(fakeTarget.addEventListener).toHaveBeenCalledTimes(1)
    const [eventName, handler] = fakeTarget.addEventListener.mock.calls[0]!
    expect(eventName).toBe('keydown')
    expect(typeof handler).toBe('function')

    detach()

    expect(fakeTarget.removeEventListener).toHaveBeenCalledTimes(1)
    const [detachEventName, detachHandler] = fakeTarget.removeEventListener.mock.calls[0]!
    expect(detachEventName).toBe('keydown')
    expect(detachHandler).toBe(handler)
  })

  it('never imports or constructs THREE objects — the selection ring stays the only indicator', () => {
    const source = readFileSync(
      fileURLToPath(new URL('./keyboard-controller.ts', import.meta.url)),
      'utf8'
    )
    expect(source).not.toMatch(/from ['"]three['"]/)
    expect(source).not.toMatch(/new THREE\.(Mesh|Line)/)
  })

  describe('terminal command arbitration (design Area 8)', () => {
    it('t opens a terminal for the selected node and focuses the panel', () => {
      const { store, terminal, controller } = setup('a')
      const handled = controller.handleKeyDown(baseEvent({ key: 't' }))
      expect(handled).toBe(true)
      expect(store.get().terminals.activePanel).toMatchObject({ nodeId: 'a', placement: 'scene' })
      expect(terminal.focusActivePanel).toHaveBeenCalledOnce()
    })

    it('t with no node selected is a no-op', () => {
      const { store, terminal, controller } = setup(null)
      controller.handleKeyDown(baseEvent({ key: 't' }))
      expect(store.get().terminals.activePanel).toBeNull()
      expect(terminal.focusActivePanel).not.toHaveBeenCalled()
    })

    it('t on an already-open node just refocuses it instead of opening a second session', () => {
      const { store, controller } = setup('a')
      controller.handleKeyDown(baseEvent({ key: 't' }))
      store.dispatchTerminal({ type: 'set-focused', focused: false })
      controller.handleKeyDown(baseEvent({ key: 't' }))
      expect(store.get().terminals.byNode.get('a')).toHaveLength(1)
      expect(store.get().terminals.activePanel?.focused).toBe(true)
    })

    it('p toggles placement scene -> hud -> scene', () => {
      const { store, controller } = setup('a')
      controller.handleKeyDown(baseEvent({ key: 't' }))
      expect(store.get().terminals.activePanel?.placement).toBe('scene')
      controller.handleKeyDown(baseEvent({ key: 'p' }))
      expect(store.get().terminals.activePanel?.placement).toBe('hud')
      controller.handleKeyDown(baseEvent({ key: 'p' }))
      expect(store.get().terminals.activePanel?.placement).toBe('scene')
    })

    it('p with no terminal open is a no-op', () => {
      const { store, controller } = setup('a')
      const handled = controller.handleKeyDown(baseEvent({ key: 'p' }))
      expect(handled).toBe(false)
      expect(store.get().terminals.activePanel).toBeNull()
    })

    it('Tab cycles tabs on the active node and is consumed (default browser traversal suppressed)', () => {
      const { store, controller } = setup('a')
      controller.handleKeyDown(baseEvent({ key: 't' }))
      store.dispatchTerminal({ type: 'open-terminal-for-node', nodeId: 'a' })
      const handled = controller.handleKeyDown(baseEvent({ key: 'Tab' }))
      expect(handled).toBe(true)
      expect(store.get().terminals.activePanel?.sessionIndex).toBe(0)
    })

    it('Escape closes the active terminal via the terminal command port', () => {
      const { terminal, controller } = setup('a')
      controller.handleKeyDown(baseEvent({ key: 't' }))
      const handled = controller.handleKeyDown(baseEvent({ key: 'Escape' }))
      expect(handled).toBe(true)
      expect(terminal.closeActiveSession).toHaveBeenCalledOnce()
    })

    it('Escape with no terminal open is a graph-nav no-op, never reaches the terminal port', () => {
      const { terminal, controller } = setup('a')
      const handled = controller.handleKeyDown(baseEvent({ key: 'Escape' }))
      expect(handled).toBe(false)
      expect(terminal.closeActiveSession).not.toHaveBeenCalled()
    })

    it('spawn-close beats terminal-close: Escape with both open cancels spawn, leaves the terminal untouched (SPAWN-005)', () => {
      const { store, terminal, controller } = setup('a')
      controller.handleKeyDown(baseEvent({ key: 't' })) // terminal open
      store.dispatchSpawn({ type: 'open-for-node', nodeId: 'a' }) // spawn radial open

      const handled = controller.handleKeyDown(baseEvent({ key: 'Escape' }))

      expect(handled).toBe(true)
      expect(store.get().spawnMenu.view).toBe('closed')
      expect(terminal.closeActiveSession).not.toHaveBeenCalled()
      expect(store.get().terminals.activePanel).not.toBeNull()
    })

    it('once spawn is closed, Escape still routes to terminal-close as before', () => {
      const { store, terminal, controller } = setup('a')
      controller.handleKeyDown(baseEvent({ key: 't' }))
      store.dispatchSpawn({ type: 'open-for-node', nodeId: 'a' })
      controller.handleKeyDown(baseEvent({ key: 'Escape' })) // closes spawn only

      const handled = controller.handleKeyDown(baseEvent({ key: 'Escape' }))

      expect(handled).toBe(true)
      expect(terminal.closeActiveSession).toHaveBeenCalledOnce()
    })

    it('a focused text-entry target (xterm textarea) suppresses hjkl AND the terminal commands alike', () => {
      const { store, terminal, controller } = setup('a')
      const textarea = { tagName: 'TEXTAREA', isContentEditable: false }
      controller.handleKeyDown(baseEvent({ key: 'h', target: textarea }))
      controller.handleKeyDown(baseEvent({ key: 't', target: textarea }))
      controller.handleKeyDown(baseEvent({ key: 'Escape', target: textarea }))
      expect(store.get().selection.selectedId).toBe('a')
      expect(store.get().terminals.activePanel).toBeNull()
      expect(terminal.focusActivePanel).not.toHaveBeenCalled()
      expect(terminal.closeActiveSession).not.toHaveBeenCalled()
    })
  })

  describe('spawn command arbitration (SPAWN-002/005)', () => {
    it('s with a node selected and spawn closed opens the radial anchored to it', () => {
      const { store, controller } = setup('a')
      const handled = controller.handleKeyDown(baseEvent({ key: 's' }))
      expect(handled).toBe(true)
      expect(store.get().spawnMenu).toMatchObject({ view: 'radial', nodeId: 'a' })
    })

    it('s with no node selected and spawn closed opens the form directly (rootless)', () => {
      const { store, controller } = setup(null)
      const handled = controller.handleKeyDown(baseEvent({ key: 's' }))
      expect(handled).toBe(true)
      expect(store.get().spawnMenu).toMatchObject({ view: 'form', parentId: null })
    })

    it('s while the radial is open chooses the spawn chip, transitioning radial -> form', () => {
      const { store, controller } = setup('a')
      controller.handleKeyDown(baseEvent({ key: 's' }))
      const handled = controller.handleKeyDown(baseEvent({ key: 's' }))
      expect(handled).toBe(true)
      expect(store.get().spawnMenu).toMatchObject({ view: 'form', parentId: 'a' })
    })

    it('s while the form is already open is a no-op', () => {
      const { store, controller } = setup(null)
      controller.handleKeyDown(baseEvent({ key: 's' }))
      const handled = controller.handleKeyDown(baseEvent({ key: 's' }))
      expect(handled).toBe(false)
      expect(store.get().spawnMenu.view).toBe('form')
    })

    it('hjkl while the radial is open is a handled no-op — it never moves the graph selection', () => {
      const { store, controller } = setup('a')
      controller.handleKeyDown(baseEvent({ key: 's' }))
      const handled = controller.handleKeyDown(baseEvent({ key: 'j' }))
      expect(handled).toBe(true)
      expect(store.get().selection.selectedId).toBe('a')
      expect(store.get().spawnMenu.view).toBe('radial')
    })

    it("typing 's' into a focused form field never dispatches open-spawn (isTextEntryTarget guard)", () => {
      const { store, controller } = setup('a')
      const input = { tagName: 'INPUT', isContentEditable: false }
      const handled = controller.handleKeyDown(baseEvent({ key: 's', target: input }))
      expect(handled).toBe(false)
      expect(store.get().spawnMenu.view).toBe('closed')
    })
  })
})
