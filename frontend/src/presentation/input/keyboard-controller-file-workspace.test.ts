import { describe, expect, it, vi } from 'vitest'
import { createKeyboardController } from './keyboard-controller'
import type { KeyboardControllerEvent } from './keyboard-controller'
import { createSceneStore } from '../../application/scene-store'
import { inertActivity } from '../../domain/worktree-graph/node-activity'
import type { WorktreeNode } from '../../domain/worktree-graph/types'

const node = (id: string): WorktreeNode => ({
  id,
  repoId: 'repo',
  branch: id,
  path: `/tmp/${id}`,
  status: 'clean',
  isMain: true,
  kind: 'root',
  parentId: null,
  childIds: [],
  activity: inertActivity()
})

const key = (overrides: Partial<KeyboardControllerEvent>): KeyboardControllerEvent => ({
  key: '',
  altKey: false,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  target: null,
  ...overrides
})

function setup(selectedId: string | null = 'w', open = false) {
  const store = createSceneStore()
  store.update({
    graph: { nodes: new Map([['w', node('w')]]), edges: [], rootIds: ['w'] },
    selection: { selectedId }
  })
  const fileWorkspace = {
    openPicker: vi.fn(),
    openFile: vi.fn(),
    isOpen: vi.fn(() => open),
    requestClose: vi.fn(() => true)
  }
  const worktreeDelete = { request: vi.fn(), isOpen: () => false, cancel: () => false }
  const controller = createKeyboardController({
    store,
    heights: {
      current: () => 'isla',
      goTo: vi.fn(() => true),
      goToCamada: vi.fn(() => true),
      refitCamada: vi.fn(),
      pop: vi.fn(() => false),
      reanchorIsland: vi.fn(),
      animateToExtent: vi.fn(),
      onSelectionChanged: vi.fn()
    },
    terminal: { focusActivePanel: vi.fn(), closeActiveSession: vi.fn() },
    diff: { select: vi.fn() },
    worktreeDelete,
    fileWorkspace,
    platform: { isMac: false }
  })
  return { store, fileWorkspace, controller }
}

const openDiff = (store: ReturnType<typeof createSceneStore>, selectedPath: string | null) => {
  store.dispatchDiffView({ type: 'open', nodeId: 'w', baseRef: 'main' })
  store.dispatchDiffView({
    type: 'rail-loaded',
    compare: { headOid: 'h', mergeBase: 'm' },
    files: [{ path: 'src/a.ts', status: 'M', added: 1, removed: 0 }] as never
  })
  if (selectedPath !== null) store.dispatchDiffView({ type: 'select', path: selectedPath })
}

describe('keyboard controller — file workspace', () => {
  it('o opens the picker for the selected node', () => {
    const { controller, fileWorkspace } = setup()
    expect(controller.handleKeyDown(key({ key: 'o' }))).toBe(true)
    expect(fileWorkspace.openPicker).toHaveBeenCalledWith('w')
  })

  it('o without a selection is not handled', () => {
    const { controller, fileWorkspace } = setup(null)
    expect(controller.handleKeyDown(key({ key: 'o' }))).toBe(false)
    expect(fileWorkspace.openPicker).not.toHaveBeenCalled()
  })

  it('o is inert while a modal owns the keyboard', () => {
    const { controller, store, fileWorkspace } = setup()
    store.dispatchCommandPalette({ type: 'open' })
    expect(controller.handleKeyDown(key({ key: 'o' }))).toBe(true)
    expect(fileWorkspace.openPicker).not.toHaveBeenCalled()
  })

  it('does not trigger while typing in a text field', () => {
    const { controller, fileWorkspace } = setup()
    const target = { tagName: 'INPUT', isContentEditable: false }
    expect(controller.handleKeyDown(key({ key: 'o', target }))).toBe(false)
    expect(fileWorkspace.openPicker).not.toHaveBeenCalled()
  })

  it.each(['o', 'Enter'])('%s in diff mode opens the selected rail file', (name) => {
    const { controller, store, fileWorkspace } = setup()
    openDiff(store, 'src/a.ts')
    expect(controller.handleKeyDown(key({ key: name }))).toBe(true)
    expect(fileWorkspace.openFile).toHaveBeenCalledWith('w', 'src/a.ts')
  })

  it('o in diff mode without a selected row falls back to the picker; Enter does nothing', () => {
    const { controller, store, fileWorkspace } = setup()
    openDiff(store, null)
    controller.handleKeyDown(key({ key: 'Enter' }))
    expect(fileWorkspace.openFile).not.toHaveBeenCalled()
    expect(fileWorkspace.openPicker).not.toHaveBeenCalled()
    controller.handleKeyDown(key({ key: 'o' }))
    expect(fileWorkspace.openPicker).toHaveBeenCalledWith('w')
  })

  it('swallows graph keys and routes Escape to the workspace while it is open', () => {
    const { controller, store, fileWorkspace } = setup('w', true)
    expect(controller.handleKeyDown(key({ key: 'j' }))).toBe(true)
    expect(controller.handleKeyDown(key({ key: 'Backspace' }))).toBe(true)
    expect(fileWorkspace.requestClose).not.toHaveBeenCalled()
    expect(controller.handleKeyDown(key({ key: 'Escape' }))).toBe(true)
    expect(fileWorkspace.requestClose).toHaveBeenCalledTimes(1)
    expect(store.get().selection.selectedId).toBe('w')
  })

  it('leaves text-entry keys (incl. Escape inside the editor) to the element', () => {
    const { controller, fileWorkspace } = setup('w', true)
    const target = { tagName: 'TEXTAREA', isContentEditable: false }
    expect(controller.handleKeyDown(key({ key: 'Escape', target }))).toBe(false)
    expect(fileWorkspace.requestClose).not.toHaveBeenCalled()
  })

  it.each([
    ['k', 'open-palette'],
    ['p', 'open-projects']
  ])('Ctrl+%s (%s) never opens a modal over the open workspace', (letter) => {
    const { controller, store } = setup('w', true)
    expect(controller.handleKeyDown(key({ key: letter, ctrlKey: true }))).toBe(true)
    expect(store.get().commandPalette.view).toBe('closed')
    expect(store.get().projectSelector.view).toBe('closed')
  })

  it('uses the platform chord only (Mac: o has no modifier either)', () => {
    const { controller, fileWorkspace } = setup()
    expect(controller.handleKeyDown(key({ key: 'o', metaKey: true }))).toBe(false)
    expect(fileWorkspace.openPicker).not.toHaveBeenCalled()
  })
})
