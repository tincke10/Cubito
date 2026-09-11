import { describe, expect, it } from 'vitest'
import { createCompareViewBinder } from './bind-compare-view'
import type { BindCompareViewDeps } from './bind-compare-view'
import { createSceneStore } from './application/scene-store'
import type { CameraHeight } from './presentation/camera/camera-pose'
import type { CompareRailHandle } from './presentation/compare/compare-rail-element'
import type { CompareHudHandle } from './presentation/compare/compare-hud-element'
import type { CompareMergeActionHandle } from './presentation/compare/compare-merge-action-element'
import type { DiffRailHandle } from './presentation/diff/diff-rail-element'
import type { DiffPanelHandle } from './presentation/diff/diff-panel-element'

const fakeChildRail = (): CompareRailHandle => ({
  root: {} as HTMLElement,
  apply() {},
  onFocusChild() {},
  onSetWinner() {},
  dispose() {}
})

const fakeFileRail = (): DiffRailHandle => ({
  root: {} as HTMLElement,
  apply() {},
  onSelect() {},
  dispose() {}
})

const fakePanel = (): DiffPanelHandle => ({
  element: {} as HTMLElement,
  apply() {},
  dispose() {}
})

const fakeHud = (): CompareHudHandle => ({
  root: {} as HTMLElement,
  keyboardBar: { root: {} as HTMLElement, apply() {}, dispose() {} },
  apply() {},
  dispose() {}
})

const fakeMergeAction = (): CompareMergeActionHandle => ({
  root: {} as HTMLElement,
  apply() {},
  onMergeWinner() {},
  dispose() {}
})

type FakeHeights = {
  goToCalls: CameraHeight[]
  popCalls: number
  goToReturns: boolean
  goTo(height: CameraHeight): boolean
  pop(): boolean
}

const createFakeHeights = (goToReturns = true): FakeHeights => ({
  goToCalls: [],
  popCalls: 0,
  goToReturns,
  goTo(height) {
    this.goToCalls.push(height)
    return this.goToReturns
  },
  pop() {
    this.popCalls++
    return true
  }
})

function setup(heights: FakeHeights) {
  const store = createSceneStore()
  const deps: BindCompareViewDeps = {
    store,
    compareSlot: { appendChild() {} },
    keyboardBarSlot: { appendChild() {} },
    demoGateway: {
      gitBranchCompare: async () => {
        throw new Error('not stubbed for this test')
      },
      gitBranchDiff: async () => {
        throw new Error('not stubbed for this test')
      },
      gitMergeWinnerIntoParent: async () => {
        throw new Error('not stubbed for this test')
      }
    },
    heights,
    createChildRail: fakeChildRail,
    createFileRail: fakeFileRail,
    createPanel: fakePanel,
    createHud: fakeHud,
    createMergeAction: fakeMergeAction
  }
  const binder = createCompareViewBinder(deps)
  return { store, binder }
}

describe('createCompareViewBinder — camera height push/pop', () => {
  it('the open transition starts the loader and pushes the comparar height', () => {
    const heights = createFakeHeights()
    const { store, binder } = setup(heights)

    store.dispatchCompareView({ type: 'open', members: [] })
    binder.sync()

    expect(heights.goToCalls).toEqual(['comparar'])
  })

  it('the close transition stops the loader and pops it', () => {
    const heights = createFakeHeights()
    const { store, binder } = setup(heights)

    store.dispatchCompareView({ type: 'open', members: [] })
    binder.sync()
    store.dispatchCompareView({ type: 'close' })
    binder.sync()

    expect(heights.popCalls).toBe(1)
  })

  it('a close with nothing pushed does not pop', () => {
    const heights = createFakeHeights(false)
    const { store, binder } = setup(heights)

    store.dispatchCompareView({ type: 'open', members: [] })
    binder.sync()
    store.dispatchCompareView({ type: 'close' })
    binder.sync()

    expect(heights.popCalls).toBe(0)
  })

  it('repeated syncs while open push exactly once', () => {
    const heights = createFakeHeights()
    const { store, binder } = setup(heights)

    store.dispatchCompareView({ type: 'open', members: [] })
    binder.sync()
    binder.sync()
    binder.sync()

    expect(heights.goToCalls).toEqual(['comparar'])
  })
})
