import { describe, expect, it, vi } from 'vitest'
import { createCompareViewController } from './compare-view-controller'
import type { CompareViewControllerDeps } from './compare-view-controller'
import { emptyCompareViewSlice, reduceCompareView } from '../../application/compare-view-model'
import type { CompareViewSlice } from '../../application/compare-view-model'
import type { ConnectionState } from '../../application/scene-store'
import type { CompareRailHandle } from './compare-rail-element'
import type { CompareHudHandle } from './compare-hud-element'
import type { CompareMergeActionHandle } from './compare-merge-action-element'
import type { DiffRailHandle } from '../diff/diff-rail-element'
import type { DiffPanelHandle } from '../diff/diff-panel-element'

const CONNECTED: ConnectionState = { state: 'connected', runtimeId: 'rt-1' }

const createFakeChildRail = (): CompareRailHandle & {
  applyCalls: unknown[]
  disposed: boolean
  emitFocus(childId: string): void
  emitWinner(childId: string | null): void
} => {
  let focusCb: ((childId: string) => void) | null = null
  let winnerCb: ((childId: string | null) => void) | null = null
  const handle = {
    root: {} as HTMLElement,
    applyCalls: [] as unknown[],
    disposed: false,
    apply: vi.fn((rows) => handle.applyCalls.push(rows)),
    onFocusChild: vi.fn((cb: (childId: string) => void) => (focusCb = cb)),
    onSetWinner: vi.fn((cb: (childId: string | null) => void) => (winnerCb = cb)),
    dispose: vi.fn(() => (handle.disposed = true)),
    emitFocus(childId: string) {
      focusCb?.(childId)
    },
    emitWinner(childId: string | null) {
      winnerCb?.(childId)
    }
  }
  return handle
}

const createFakeFileRail = (): DiffRailHandle & {
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

const createFakeHud = (): CompareHudHandle & { applyCalls: unknown[]; disposed: boolean } => {
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

const branchLabelFor = (childId: string): string => `cubito-${childId}`

const createFakeMergeAction = (): CompareMergeActionHandle & {
  applyCalls: unknown[]
  disposed: boolean
  emitMergeWinner(syncWorkingTree: boolean): void
} => {
  let mergeCb: ((syncWorkingTree: boolean) => void) | null = null
  const handle = {
    root: {} as HTMLElement,
    applyCalls: [] as unknown[],
    disposed: false,
    apply: vi.fn((model) => handle.applyCalls.push(model)),
    onMergeWinner: vi.fn((cb: (syncWorkingTree: boolean) => void) => (mergeCb = cb)),
    dispose: vi.fn(() => (handle.disposed = true)),
    emitMergeWinner(syncWorkingTree: boolean) {
      mergeCb?.(syncWorkingTree)
    }
  }
  return handle
}

const setup = () => {
  const childRails: ReturnType<typeof createFakeChildRail>[] = []
  const fileRails: ReturnType<typeof createFakeFileRail>[] = []
  const panels: ReturnType<typeof createFakePanel>[] = []
  const huds: ReturnType<typeof createFakeHud>[] = []
  const mergeActions: ReturnType<typeof createFakeMergeAction>[] = []
  const hud = { appendChild: vi.fn() }
  const keyboardBarSlot = { appendChild: vi.fn() }
  const onEnter = vi.fn()
  const onExit = vi.fn()
  const onFocusChild = vi.fn()
  const onSetWinner = vi.fn()
  const onSelectFile = vi.fn()
  const onMergeWinner = vi.fn()
  const deps: CompareViewControllerDeps = {
    createChildRail: () => {
      const r = createFakeChildRail()
      childRails.push(r)
      return r
    },
    createFileRail: () => {
      const r = createFakeFileRail()
      fileRails.push(r)
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
    createMergeAction: () => {
      const m = createFakeMergeAction()
      mergeActions.push(m)
      return m
    },
    hud,
    keyboardBarSlot,
    onFocusChild,
    onSetWinner,
    onSelectFile,
    onMergeWinner,
    onEnter,
    onExit
  }
  const controller = createCompareViewController(deps)
  return {
    controller,
    childRails,
    fileRails,
    panels,
    huds,
    mergeActions,
    hud,
    keyboardBarSlot,
    onEnter,
    onExit,
    onFocusChild,
    onSetWinner,
    onSelectFile,
    onMergeWinner
  }
}

const openSlice = (members: readonly string[] = ['child-1', 'child-2']): CompareViewSlice =>
  reduceCompareView(emptyCompareViewSlice(), { type: 'open', members })

describe('createCompareViewController', () => {
  it('does nothing while closed', () => {
    const { controller, childRails } = setup()
    controller.sync(emptyCompareViewSlice(), CONNECTED, branchLabelFor, false)
    expect(childRails).toHaveLength(0)
  })

  it('mounts child-rail/file-rail/panel/hud/merge-action into the #compare slot and the keyboard bar into its own slot on open', () => {
    const { controller, childRails, fileRails, panels, huds, mergeActions, hud, keyboardBarSlot } =
      setup()
    controller.sync(openSlice(), CONNECTED, branchLabelFor, false)
    expect(childRails).toHaveLength(1)
    expect(fileRails).toHaveLength(1)
    expect(panels).toHaveLength(1)
    expect(huds).toHaveLength(1)
    expect(mergeActions).toHaveLength(1)
    expect(hud.appendChild).toHaveBeenCalledWith(huds[0]!.root)
    expect(hud.appendChild).toHaveBeenCalledWith(childRails[0]!.root)
    expect(hud.appendChild).toHaveBeenCalledWith(fileRails[0]!.root)
    expect(hud.appendChild).toHaveBeenCalledWith(panels[0]!.element)
    expect(hud.appendChild).toHaveBeenCalledWith(mergeActions[0]!.root)
    expect(keyboardBarSlot.appendChild).toHaveBeenCalledWith(huds[0]!.keyboardBar.root)
  })

  it('calls onEnter once on the closed->open transition, not again on a later open sync', () => {
    const { controller, onEnter } = setup()
    controller.sync(openSlice(), CONNECTED, branchLabelFor, false)
    controller.sync(openSlice(), CONNECTED, branchLabelFor, false)
    expect(onEnter).toHaveBeenCalledOnce()
  })

  it('applies the child-rail view-model from every member, focused/winner from the slice', () => {
    const { controller, childRails } = setup()
    let slice = openSlice(['child-1', 'child-2'])
    slice = reduceCompareView(slice, { type: 'focus-child', childId: 'child-1' })
    slice = reduceCompareView(slice, { type: 'set-winner', winnerId: 'child-2' })
    controller.sync(slice, CONNECTED, branchLabelFor, false)

    const rows = childRails[0]!.applyCalls[0] as Array<{
      childId: string
      focused: boolean
      isWinner: boolean
    }>
    expect(rows.map((r) => r.childId)).toEqual(['child-1', 'child-2'])
    expect(rows[0]!.focused).toBe(true)
    expect(rows[1]!.isWinner).toBe(true)
  })

  it('applies the focused child files/selection to the file rail, and its panel to the panel', () => {
    const { controller, fileRails, panels } = setup()
    let slice = openSlice(['child-1'])
    slice = reduceCompareView(slice, {
      type: 'child-rail-loaded',
      childId: 'child-1',
      compare: { headOid: 'a', mergeBase: 'b' },
      files: [{ path: 'x.ts', status: 'modified', added: 1, removed: 0 }]
    })
    slice = reduceCompareView(slice, { type: 'focus-child', childId: 'child-1' })
    controller.sync(slice, CONNECTED, branchLabelFor, false)

    expect(fileRails[0]!.applyCalls[0]).toMatchObject([{ path: 'x.ts' }])
    expect(panels[0]!.applyCalls[0]).toMatchObject({ kind: 'idle' })
  })

  it('shows an idle panel and empty file rail while no child is focused', () => {
    const { controller, fileRails, panels } = setup()
    controller.sync(openSlice(), CONNECTED, branchLabelFor, false)
    expect(fileRails[0]!.applyCalls[0]).toEqual([])
    expect(panels[0]!.applyCalls[0]).toMatchObject({ kind: 'idle' })
  })

  it('applies the hud with membersCount and the resolved winner label', () => {
    const { controller, huds } = setup()
    let slice = openSlice(['child-1', 'child-2'])
    slice = reduceCompareView(slice, { type: 'set-winner', winnerId: 'child-2' })
    controller.sync(slice, CONNECTED, branchLabelFor, false)
    expect(huds[0]!.applyCalls[0]).toMatchObject({
      connection: CONNECTED,
      membersCount: 2,
      winnerLabel: 'cubito-child-2'
    })
  })

  it('forwards child-rail focus/winner clicks and file-rail select clicks', () => {
    const { controller, childRails, fileRails, onFocusChild, onSetWinner, onSelectFile } = setup()
    controller.sync(openSlice(), CONNECTED, branchLabelFor, false)
    childRails[0]!.emitFocus('child-2')
    childRails[0]!.emitWinner('child-1')
    fileRails[0]!.emitSelect('x.ts')
    expect(onFocusChild).toHaveBeenCalledWith('child-2')
    expect(onSetWinner).toHaveBeenCalledWith('child-1')
    expect(onSelectFile).toHaveBeenCalledWith('x.ts')
  })

  it('does not remount on a second open sync — same instances, apply called again', () => {
    const { controller, childRails, fileRails, panels, huds } = setup()
    controller.sync(openSlice(), CONNECTED, branchLabelFor, false)
    controller.sync(openSlice(), CONNECTED, branchLabelFor, false)
    expect(childRails).toHaveLength(1)
    expect(fileRails).toHaveLength(1)
    expect(panels).toHaveLength(1)
    expect(huds).toHaveLength(1)
    expect(childRails[0]!.apply).toHaveBeenCalledTimes(2)
  })

  it('unmounts and calls onExit on close', () => {
    const { controller, childRails, fileRails, panels, huds, onExit } = setup()
    controller.sync(openSlice(), CONNECTED, branchLabelFor, false)
    controller.sync(emptyCompareViewSlice(), CONNECTED, branchLabelFor, false)
    expect(childRails[0]!.disposed).toBe(true)
    expect(fileRails[0]!.disposed).toBe(true)
    expect(panels[0]!.disposed).toBe(true)
    expect(huds[0]!.disposed).toBe(true)
    expect(onExit).toHaveBeenCalledOnce()
  })

  it('a second closed sync after unmount is idempotent — onExit not called again', () => {
    const { controller, onExit } = setup()
    controller.sync(openSlice(), CONNECTED, branchLabelFor, false)
    controller.sync(emptyCompareViewSlice(), CONNECTED, branchLabelFor, false)
    controller.sync(emptyCompareViewSlice(), CONNECTED, branchLabelFor, false)
    expect(onExit).toHaveBeenCalledOnce()
  })

  it('reopening after a close mounts fresh instances and calls onEnter again', () => {
    const { controller, childRails, onEnter } = setup()
    controller.sync(openSlice(), CONNECTED, branchLabelFor, false)
    controller.sync(emptyCompareViewSlice(), CONNECTED, branchLabelFor, false)
    controller.sync(openSlice(), CONNECTED, branchLabelFor, false)
    expect(childRails).toHaveLength(2)
    expect(onEnter).toHaveBeenCalledTimes(2)
  })

  it('dispose() unmounts whatever is currently mounted', () => {
    const { controller, childRails, fileRails, panels, huds, mergeActions } = setup()
    controller.sync(openSlice(), CONNECTED, branchLabelFor, false)
    controller.dispose()
    expect(childRails[0]!.disposed).toBe(true)
    expect(fileRails[0]!.disposed).toBe(true)
    expect(panels[0]!.disposed).toBe(true)
    expect(huds[0]!.disposed).toBe(true)
    expect(mergeActions[0]!.disposed).toBe(true)
  })
})

describe('createCompareViewController — winner-merge action (Change E)', () => {
  it('is hidden while no winner is picked, visible once one is', () => {
    const { controller, mergeActions } = setup()
    controller.sync(openSlice(), CONNECTED, branchLabelFor, true)
    expect(mergeActions[0]!.applyCalls[0]).toMatchObject({ visible: false })

    const withWinner = reduceCompareView(openSlice(), { type: 'set-winner', winnerId: 'child-1' })
    controller.sync(withWinner, CONNECTED, branchLabelFor, true)
    expect(mergeActions[0]!.applyCalls[1]).toMatchObject({ visible: true })
  })

  it('forwards the sync mergeCapable flag straight through as capable', () => {
    const { controller, mergeActions } = setup()
    controller.sync(openSlice(), CONNECTED, branchLabelFor, false)
    expect(mergeActions[0]!.applyCalls[0]).toMatchObject({ capable: false })

    controller.sync(openSlice(), CONNECTED, branchLabelFor, true)
    expect(mergeActions[0]!.applyCalls[1]).toMatchObject({ capable: true })
  })

  it('forwards the sync mergeSyncCapable flag straight through as syncCapable', () => {
    const { controller, mergeActions } = setup()
    controller.sync(openSlice(), CONNECTED, branchLabelFor, true, false)
    expect(mergeActions[0]!.applyCalls[0]).toMatchObject({ syncCapable: false })

    controller.sync(openSlice(), CONNECTED, branchLabelFor, true, true)
    expect(mergeActions[0]!.applyCalls[1]).toMatchObject({ syncCapable: true })
  })

  it('applies the merge slice state verbatim', () => {
    const { controller, mergeActions } = setup()
    const running = reduceCompareView(openSlice(), { type: 'merge-start' })
    controller.sync(running, CONNECTED, branchLabelFor, true)
    expect(mergeActions[0]!.applyCalls[0]).toMatchObject({ merge: { phase: 'running' } })
  })

  it('routes the merge action fire callback to onMergeWinner, forwarding the boolean arg', () => {
    const { controller, mergeActions, onMergeWinner } = setup()
    controller.sync(openSlice(), CONNECTED, branchLabelFor, true)
    mergeActions[0]!.emitMergeWinner(true)
    expect(onMergeWinner).toHaveBeenCalledExactlyOnceWith(true)
  })
})
