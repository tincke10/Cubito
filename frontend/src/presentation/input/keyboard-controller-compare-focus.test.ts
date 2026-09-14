import { describe, expect, it, vi } from 'vitest'
import { createKeyboardController } from './keyboard-controller'
import type { KeyboardControllerEvent } from './keyboard-controller'
import type { CameraHeightController } from './camera-height-controller'
import type { CameraHeight } from '../camera/camera-pose'
import { createSceneStore } from '../../application/scene-store'
import { inertActivity } from '../../domain/worktree-graph/node-activity'
import type { WorktreeGraph, WorktreeNode } from '../../domain/worktree-graph/types'

// Sibling of keyboard-controller.test.ts (already ~1009 raw / over the counted-line test budget,
// design C1) — covers ONLY the compare-focus move branch added in W2.

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

function buildFanGraph(): WorktreeGraph {
  const nodes = new Map<string, WorktreeNode>([
    ['root', node('root', null, ['a', 'b', 'c'])],
    ['a', node('a', 'root', [])],
    ['b', node('b', 'root', [])],
    ['c', node('c', 'root', [])]
  ])
  return { nodes, edges: [], rootIds: ['root'] }
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

function fakeHeights(): CameraHeightController {
  return {
    current: vi.fn((): CameraHeight => 'isla'),
    goTo: vi.fn(() => true),
    pop: vi.fn(() => false),
    reanchorIsland: vi.fn(),
    animateToExtent: vi.fn(),
    onSelectionChanged: vi.fn()
  }
}

/** Drives fan-out-model's real reducer to a 'running' slice, then opens compare on its litter. */
function withOpenCompare(
  store: ReturnType<typeof createSceneStore>,
  parentId: string,
  childWorktreeIds: readonly string[]
): void {
  store.dispatchFanOut({ type: 'open-for-node', nodeId: parentId })
  store.dispatchFanOut({ type: 'set-repo-selector', repoSelector: 'id:repo-a' })
  const mutationIds = childWorktreeIds.map((_, i) => `m${i}`)
  store.dispatchFanOut({ type: 'submit', mutationIds })
  mutationIds.forEach((mutationId, i) => {
    store.dispatchFanOut({ type: 'child-created', mutationId, worktreeId: childWorktreeIds[i]! })
  })
  store.dispatchCompareView({ type: 'open', members: childWorktreeIds })
}

function setup(selectedId: string | null = 'a') {
  const store = createSceneStore()
  store.update({ graph: buildFanGraph(), selection: { selectedId } })
  const heights = fakeHeights()
  const terminal = fakeTerminalCommandPort()
  const controller = createKeyboardController({
    store,
    heights,
    terminal,
    platform: { isMac: false }
  })
  return { store, heights, terminal, controller }
}

describe('compare focus move branch (design D3/D5)', () => {
  it('h and k step the compare focus backward; l and j forward', () => {
    const { store, controller } = setup()
    withOpenCompare(store, 'root', ['w1', 'w2', 'w3'])
    expect(store.get().compareView).toMatchObject({ focusedChildId: 'w1' })

    controller.handleKeyDown(baseEvent({ key: 'l' }))
    expect(store.get().compareView).toMatchObject({ focusedChildId: 'w2' })

    controller.handleKeyDown(baseEvent({ key: 'j' }))
    expect(store.get().compareView).toMatchObject({ focusedChildId: 'w3' })

    controller.handleKeyDown(baseEvent({ key: 'h' }))
    expect(store.get().compareView).toMatchObject({ focusedChildId: 'w2' })

    controller.handleKeyDown(baseEvent({ key: 'k' }))
    expect(store.get().compareView).toMatchObject({ focusedChildId: 'w1' })
  })

  it('the arrow keys step the compare focus exactly like hjkl', () => {
    const { store, controller } = setup()
    withOpenCompare(store, 'root', ['w1', 'w2', 'w3'])

    controller.handleKeyDown(baseEvent({ key: 'ArrowRight' }))
    expect(store.get().compareView).toMatchObject({ focusedChildId: 'w2' })
    controller.handleKeyDown(baseEvent({ key: 'ArrowDown' }))
    expect(store.get().compareView).toMatchObject({ focusedChildId: 'w3' })
    controller.handleKeyDown(baseEvent({ key: 'ArrowLeft' }))
    expect(store.get().compareView).toMatchObject({ focusedChildId: 'w2' })
    controller.handleKeyDown(baseEvent({ key: 'ArrowUp' }))
    expect(store.get().compareView).toMatchObject({ focusedChildId: 'w1' })
  })

  it('l wraps from the last member back to the first', () => {
    const { store, controller } = setup()
    withOpenCompare(store, 'root', ['w1', 'w2'])
    controller.handleKeyDown(baseEvent({ key: 'l' })) // -> w2

    controller.handleKeyDown(baseEvent({ key: 'l' }))

    expect(store.get().compareView).toMatchObject({ focusedChildId: 'w1' })
  })

  it('never touches the graph selection while stepping the compare focus (design D3)', () => {
    const { store, controller } = setup('a')
    withOpenCompare(store, 'root', ['w1', 'w2'])
    const selectedBefore = store.get().selection.selectedId

    controller.handleKeyDown(baseEvent({ key: 'l' }))

    expect(store.get().selection.selectedId).toBe(selectedBefore)
  })

  it('f and v are still swallowed while compare is open and never change the camera height (C5)', () => {
    const { store, heights, controller } = setup()
    withOpenCompare(store, 'root', ['w1'])

    expect(controller.handleKeyDown(baseEvent({ key: 'f' }))).toBe(true)
    expect(controller.handleKeyDown(baseEvent({ key: 'v' }))).toBe(true)

    expect(heights.goTo).not.toHaveBeenCalled()
  })

  it('t, d, x, s and c are still swallowed while compare is open', () => {
    const { store, terminal, controller } = setup()
    withOpenCompare(store, 'root', ['w1'])

    expect(controller.handleKeyDown(baseEvent({ key: 't' }))).toBe(true)
    expect(controller.handleKeyDown(baseEvent({ key: 'd' }))).toBe(true)
    expect(controller.handleKeyDown(baseEvent({ key: 'x' }))).toBe(true)
    expect(controller.handleKeyDown(baseEvent({ key: 's' }))).toBe(true)
    expect(controller.handleKeyDown(baseEvent({ key: 'c' }))).toBe(true)

    expect(terminal.focusActivePanel).not.toHaveBeenCalled()
    expect(store.get().diffView.view).toBe('closed')
    expect(store.get().systemView.view).toBe('closed')
    expect(store.get().spawnMenu.view).toBe('closed')
  })

  it('bare g still closes compare', () => {
    const { store, controller } = setup()
    withOpenCompare(store, 'root', ['w1'])

    const handled = controller.handleKeyDown(baseEvent({ key: 'g' }))

    expect(handled).toBe(true)
    expect(store.get().compareView.view).toBe('closed')
  })

  it('Esc still closes compare before popping the height', () => {
    const { store, heights, controller } = setup()
    withOpenCompare(store, 'root', ['w1'])

    const handled = controller.handleKeyDown(baseEvent({ key: 'Escape' }))

    expect(handled).toBe(true)
    expect(store.get().compareView.view).toBe('closed')
    expect(heights.pop).not.toHaveBeenCalled()
  })

  it('hjkl still moves the graph selection while compare is closed', () => {
    const { store, controller } = setup('root')

    controller.handleKeyDown(baseEvent({ key: 'l' })) // child: root -> a

    expect(store.get().selection.selectedId).toBe('a')
  })

  it('hjkl is still fully swallowed while the system or diff view is open', () => {
    const { store, controller } = setup('a')
    controller.handleKeyDown(baseEvent({ key: 'x' }))
    const selectedBefore = store.get().selection.selectedId

    const handled = controller.handleKeyDown(baseEvent({ key: 'l' }))

    expect(handled).toBe(true)
    expect(store.get().selection.selectedId).toBe(selectedBefore)
  })
})
