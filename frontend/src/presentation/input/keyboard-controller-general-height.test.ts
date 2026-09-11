import { describe, expect, it, vi } from 'vitest'
import { createKeyboardController } from './keyboard-controller'
import type { KeyboardControllerEvent } from './keyboard-controller'
import type { CameraHeightController } from './camera-height-controller'
import type { CameraHeight } from '../camera/camera-pose'
import { createSceneStore } from '../../application/scene-store'
import { inertActivity } from '../../domain/worktree-graph/node-activity'
import type { WorktreeGraph, WorktreeNode } from '../../domain/worktree-graph/types'

/** Sibling of keyboard-controller.test.ts (already ~1000 raw lines, C1) — general-mode island
 *  cycling and Enter descent get their own file rather than growing that one further. */

const node = (id: string, repoId: string, isMain = false): WorktreeNode => ({
  id,
  repoId,
  branch: id,
  path: `/tmp/${id}`,
  status: 'clean',
  isMain,
  kind: isMain ? 'root' : 'worktree',
  parentId: null,
  childIds: [],
  activity: inertActivity()
})

function buildTwoRepoGraph(): WorktreeGraph {
  const nodes = new Map<string, WorktreeNode>([
    ['r1-main', node('r1-main', 'r1', true)],
    ['r2-main', node('r2-main', 'r2', true)]
  ])
  return { nodes, edges: [], rootIds: ['r1-main', 'r2-main'] }
}

const REPO_1 = { id: 'r1', path: '/r1', displayName: 'R1', kind: 'git' as const }
const REPO_2 = { id: 'r2', path: '/r2', displayName: 'R2', kind: 'git' as const }
const REPO_3 = { id: 'r3', path: '/r3', displayName: 'R3', kind: 'git' as const }

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

function fakeHeights(height: CameraHeight = 'general'): CameraHeightController & {
  currentHeight: CameraHeight
} {
  const heights = {
    currentHeight: height,
    current: vi.fn((): CameraHeight => heights.currentHeight),
    goTo: vi.fn(() => true),
    pop: vi.fn(() => false),
    reanchorIsland: vi.fn(),
    animateToExtent: vi.fn(),
    onSelectionChanged: vi.fn()
  }
  return heights
}

function setup(height: CameraHeight = 'general') {
  const store = createSceneStore()
  store.update({ graph: buildTwoRepoGraph(), selection: { selectedId: null } })
  store.dispatchRepos({ type: 'set-list', list: [REPO_1, REPO_2, REPO_3] })
  const heights = fakeHeights(height)
  const terminal = { focusActivePanel: vi.fn(), closeActiveSession: vi.fn() }
  const controller = createKeyboardController({
    store,
    heights,
    terminal,
    platform: { isMac: false }
  })
  return { store, heights, terminal, controller }
}

describe('general-mode island cycling and Enter descent (KEY-04, KEY-07, KEY-08)', () => {
  it('l and j cycle to the next island in general; h and k to the previous', () => {
    const { store, heights, controller } = setup('general')
    expect(store.get().repos.activeRepoId).toBe('r1')

    controller.handleKeyDown(baseEvent({ key: 'l' }))
    expect(store.get().repos.activeRepoId).toBe('r2')
    expect(heights.reanchorIsland).toHaveBeenCalledWith('r2')

    controller.handleKeyDown(baseEvent({ key: 'j' }))
    expect(store.get().repos.activeRepoId).toBe('r3')

    controller.handleKeyDown(baseEvent({ key: 'h' }))
    expect(store.get().repos.activeRepoId).toBe('r2')

    controller.handleKeyDown(baseEvent({ key: 'k' }))
    expect(store.get().repos.activeRepoId).toBe('r1')
  })

  it('the arrow keys cycle islands in general exactly like hjkl', () => {
    const { store, controller } = setup('general')

    controller.handleKeyDown(baseEvent({ key: 'ArrowRight' }))
    expect(store.get().repos.activeRepoId).toBe('r2')
    controller.handleKeyDown(baseEvent({ key: 'ArrowDown' }))
    expect(store.get().repos.activeRepoId).toBe('r3')
    controller.handleKeyDown(baseEvent({ key: 'ArrowLeft' }))
    expect(store.get().repos.activeRepoId).toBe('r2')
    controller.handleKeyDown(baseEvent({ key: 'ArrowUp' }))
    expect(store.get().repos.activeRepoId).toBe('r1')
  })

  it('a general-mode cycle is a handled no-op (returns true) even with an empty repo list', () => {
    const { store, heights, controller } = setup('general')
    store.dispatchRepos({ type: 'set-list', list: [] })

    const handled = controller.handleKeyDown(baseEvent({ key: 'l' }))

    expect(handled).toBe(true)
    expect(heights.reanchorIsland).not.toHaveBeenCalled()
    expect(store.get().repos.activeRepoId).toBeNull()
  })

  it('hjkl still moves the graph selection in isla, foco and comparar — never island-cycles there', () => {
    for (const height of ['isla', 'foco', 'comparar'] as const) {
      const { store, heights, controller } = setup(height)
      const before = store.get().repos.activeRepoId

      controller.handleKeyDown(baseEvent({ key: 'l' }))

      expect(store.get().repos.activeRepoId).toBe(before)
      expect(heights.reanchorIsland).not.toHaveBeenCalled()
      // moveSelection resolves to the initial selection when currentId starts null.
      expect(store.get().selection.selectedId).not.toBeNull()
    }
  })

  it("Enter in general descends to isla and selects that island's main", () => {
    const { store, heights, controller } = setup('general')
    store.update({ repos: { ...store.get().repos, activeRepoId: 'r2' } })

    const handled = controller.handleKeyDown(baseEvent({ key: 'Enter' }))

    expect(handled).toBe(true)
    expect(heights.goTo).toHaveBeenCalledWith('isla')
    expect(store.get().selection.selectedId).toBe('r2-main')
  })

  it('Enter outside general is unhandled', () => {
    for (const height of ['isla', 'foco', 'comparar'] as const) {
      const { store, heights, controller } = setup(height)

      const handled = controller.handleKeyDown(baseEvent({ key: 'Enter' }))

      expect(handled).toBe(false)
      expect(heights.goTo).not.toHaveBeenCalled()
      expect(store.get().selection.selectedId).toBeNull()
    }
  })

  it('set-height (f/v) is swallowed while the system, diff or compare view is open', () => {
    const { store, heights, controller } = setup('isla')
    store.dispatchSystemView({ type: 'open', nodeId: 'r1-main' })

    const handledF = controller.handleKeyDown(baseEvent({ key: 'f' }))
    const handledV = controller.handleKeyDown(baseEvent({ key: 'v' }))
    const handledEnter = controller.handleKeyDown(baseEvent({ key: 'Enter' }))

    expect(handledF).toBe(true)
    expect(handledV).toBe(true)
    expect(handledEnter).toBe(true)
    expect(heights.goTo).not.toHaveBeenCalled()
  })
})
