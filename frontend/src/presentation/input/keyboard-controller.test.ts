import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import { createKeyboardController } from './keyboard-controller'
import type { KeyboardControllerEvent, ScenePositions } from './keyboard-controller'
import { createSceneStore } from '../../application/scene-store'
import { moveSelection } from '../navigation/selection-model'
import { frameAll, frameIsland, frameNode, isWithinFraming } from '../camera/camera-framing'
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

const LINUX = { isMac: false }
const MAC = { isMac: true }

function setup(selectedId: string | null = 'b', platform = LINUX) {
  const store = createSceneStore()
  store.update({ graph: buildFanGraph(), selection: { selectedId } })
  const cameraRig = { animateTo: vi.fn() }
  const scenePositions = fakeScenePositions()
  const terminal = fakeTerminalCommandPort()
  const controller = createKeyboardController({
    store,
    cameraRig,
    scenePositions,
    terminal,
    platform
  })
  return { store, cameraRig, scenePositions, terminal, controller }
}

/** Two-island graph (repos 'r1'/'r2') for Tab island-cycling (PROJ-008). */
function buildTwoRepoGraph(): WorktreeGraph {
  const island = (id: string, repoId: string): WorktreeNode => ({
    ...node(id, null, []),
    repoId
  })
  const nodes = new Map<string, WorktreeNode>([
    ['x1', island('x1', 'r1')],
    ['y1', island('y1', 'r2')],
    ['y2', island('y2', 'r2')]
  ])
  return { nodes, edges: [], rootIds: ['x1', 'y1'] }
}

const ISLAND_CENTERS: Record<string, Vec3> = {
  x1: { x: -20, y: 0, z: 0 },
  y1: { x: 20, y: 0, z: 0 },
  y2: { x: 20, y: 0, z: 5 }
}

const REPO_1 = { id: 'r1', path: '/r1', displayName: 'R1', kind: 'git' as const }
const REPO_2 = { id: 'r2', path: '/r2', displayName: 'R2', kind: 'git' as const }

function setupWithRepos() {
  const store = createSceneStore()
  store.update({ graph: buildTwoRepoGraph(), selection: { selectedId: null } })
  store.dispatchRepos({ type: 'set-list', list: [REPO_1, REPO_2] })
  const cameraRig = { animateTo: vi.fn() }
  const scenePositions: ScenePositions = {
    nodeCenter: (id) => ISLAND_CENTERS[id] ?? null,
    nodeCenters: () => Object.values(ISLAND_CENTERS)
  }
  const terminal = fakeTerminalCommandPort()
  const controller = createKeyboardController({
    store,
    cameraRig,
    scenePositions,
    terminal,
    platform: LINUX
  })
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

  describe('⌘P/Ctrl+P projects chord and Tab/Escape precedence (PROJ-005/008)', () => {
    it('meta+p on Mac opens the project selector', () => {
      const { store, controller } = setup('a', MAC)
      const handled = controller.handleKeyDown(baseEvent({ key: 'p', metaKey: true }))
      expect(handled).toBe(true)
      expect(store.get().projectSelector.view).toBe('open')
    })

    it('ctrl+p on Linux/Windows opens the project selector', () => {
      const { store, controller } = setup('a', LINUX)
      const handled = controller.handleKeyDown(baseEvent({ key: 'p', ctrlKey: true }))
      expect(handled).toBe(true)
      expect(store.get().projectSelector.view).toBe('open')
    })

    it('the wrong-platform chord stays gated and does not open the selector', () => {
      const { store, controller } = setup('a', MAC)
      const handled = controller.handleKeyDown(baseEvent({ key: 'p', ctrlKey: true }))
      expect(handled).toBe(false)
      expect(store.get().projectSelector.view).toBe('closed')
    })

    it('the ⌘P/Ctrl+P chord opens the selector even while a terminal (text-entry target) is focused', () => {
      const { store, controller } = setup('a', LINUX)
      const textarea = { tagName: 'TEXTAREA', isContentEditable: false }
      const handled = controller.handleKeyDown(
        baseEvent({ key: 'p', ctrlKey: true, target: textarea })
      )
      expect(handled).toBe(true)
      expect(store.get().projectSelector.view).toBe('open')
    })

    it('bare p still pins the terminal, chord unaffected', () => {
      const { store, controller } = setup('a', LINUX)
      controller.handleKeyDown(baseEvent({ key: 't' }))
      const handled = controller.handleKeyDown(baseEvent({ key: 'p' }))
      expect(handled).toBe(true)
      expect(store.get().terminals.activePanel?.placement).toBe('hud')
      expect(store.get().projectSelector.view).toBe('closed')
    })

    it('Tab with the selector open is consumed as a no-op — never reaches terminal or island cycling', () => {
      const { store, cameraRig, controller } = setupWithRepos()
      controller.handleKeyDown(baseEvent({ key: 'p', ctrlKey: true })) // open selector
      cameraRig.animateTo.mockClear()
      const activeBefore = store.get().repos.activeRepoId

      const handled = controller.handleKeyDown(baseEvent({ key: 'Tab' }))

      expect(handled).toBe(true)
      expect(store.get().repos.activeRepoId).toBe(activeBefore)
      expect(cameraRig.animateTo).not.toHaveBeenCalled()
    })

    it('Tab with no terminal open cycles to the next island, dispatching set-active and framing its centers', () => {
      const { store, cameraRig, scenePositions, controller } = setupWithRepos()
      expect(store.get().repos.activeRepoId).toBe('r1') // reconciled default

      const handled = controller.handleKeyDown(baseEvent({ key: 'Tab' }))

      expect(handled).toBe(true)
      expect(store.get().repos.activeRepoId).toBe('r2')
      expect(cameraRig.animateTo).toHaveBeenCalledWith(
        frameIsland(store.get().graph, 'r2', scenePositions.nodeCenter),
        FOCUS_DURATION_MS
      )
    })

    it('Tab island-cycle wraps back to the first repo and is a no-op with zero repos', () => {
      const { store, controller } = setupWithRepos()
      controller.handleKeyDown(baseEvent({ key: 'Tab' })) // r1 -> r2
      controller.handleKeyDown(baseEvent({ key: 'Tab' })) // r2 -> wraps to r1
      expect(store.get().repos.activeRepoId).toBe('r1')

      store.dispatchRepos({ type: 'set-list', list: [] })
      const handled = controller.handleKeyDown(baseEvent({ key: 'Tab' }))
      expect(handled).toBe(false)
    })

    it('Tab with a terminal focused still takes precedence over island cycling', () => {
      const { store, controller } = setupWithRepos()
      store.update({ selection: { selectedId: 'x1' } })
      controller.handleKeyDown(baseEvent({ key: 't' }))
      const activeBefore = store.get().repos.activeRepoId

      const handled = controller.handleKeyDown(baseEvent({ key: 'Tab' }))

      expect(handled).toBe(true)
      expect(store.get().terminals.activePanel?.sessionIndex).toBe(0)
      expect(store.get().repos.activeRepoId).toBe(activeBefore)
    })

    it('Escape closes only the selector, leaving an open terminal and spawn menu untouched', () => {
      const { store, terminal, controller } = setup('a')
      controller.handleKeyDown(baseEvent({ key: 't' }))
      store.dispatchSpawn({ type: 'open-for-node', nodeId: 'a' })
      store.dispatchProjectSelector({ type: 'open' })

      const handled = controller.handleKeyDown(baseEvent({ key: 'Escape' }))

      expect(handled).toBe(true)
      expect(store.get().projectSelector.view).toBe('closed')
      expect(store.get().spawnMenu.view).not.toBe('closed')
      expect(terminal.closeActiveSession).not.toHaveBeenCalled()
    })

    it('attach() calls preventDefault on the ⌘P/Ctrl+P chord (suppresses the browser print dialog)', () => {
      // No DOM in this unit-test environment — `attach`'s `instanceof HTMLElement` check needs a
      // real constructor to compare against, even though `target` itself stays null below.
      vi.stubGlobal('HTMLElement', function HTMLElementStub() {})
      try {
        const { controller } = setup('a', LINUX)
        const fakeTarget = { addEventListener: vi.fn(), removeEventListener: vi.fn() }
        controller.attach(fakeTarget)
        const [, handler] = fakeTarget.addEventListener.mock.calls[0]!

        const preventDefault = vi.fn()
        handler({
          key: 'p',
          ctrlKey: true,
          metaKey: false,
          altKey: false,
          shiftKey: false,
          target: null,
          preventDefault
        } as unknown as KeyboardEvent)

        expect(preventDefault).toHaveBeenCalledOnce()
      } finally {
        vi.unstubAllGlobals()
      }
    })
  })
})
