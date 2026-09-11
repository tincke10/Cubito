import { createCompareViewController } from './presentation/compare/compare-view-controller'
import { createCompareRail } from './presentation/compare/compare-rail-element'
import type { CompareRailHandle } from './presentation/compare/compare-rail-element'
import { createDiffRail } from './presentation/diff/diff-rail-element'
import type { DiffRailHandle } from './presentation/diff/diff-rail-element'
import { createDiffPanel } from './presentation/diff/diff-panel-element'
import type { DiffPanelHandle } from './presentation/diff/diff-panel-element'
import { createCompareHud } from './presentation/compare/compare-hud-element'
import type { CompareHudHandle } from './presentation/compare/compare-hud-element'
import { createCompareMergeAction } from './presentation/compare/compare-merge-action-element'
import type { CompareMergeActionHandle } from './presentation/compare/compare-merge-action-element'
import { createCompareLiveLoader } from './application/compare-live-loader'
import type { CompareLiveLoaderGatewayPort } from './application/compare-live-loader'
import { runCompareMerge } from './application/compare-merge-run'
import type { CompareMergeGatewayPort } from './application/compare-merge-run'
import {
  GIT_MERGE_WINNER_CAPABILITY,
  GIT_MERGE_WINNER_SYNC_CAPABILITY
} from './application/runtime-capability-keys'
import type { SceneStore } from './application/scene-store'
import type { CameraHeightController } from './presentation/input/camera-height-controller'
import type { WorktreeId } from './domain/worktree-graph/types'

type CompareGatewayPort = CompareLiveLoaderGatewayPort & CompareMergeGatewayPort

export type BindCompareViewDeps = {
  store: SceneStore
  compareSlot: { appendChild(element: unknown): void }
  keyboardBarSlot: { appendChild(element: unknown): void }
  demoGateway: CompareGatewayPort
  heights: Pick<CameraHeightController, 'goTo' | 'pop'>
  /** DOM element factory overrides — tests substitute fakes, production uses the defaults. */
  createChildRail?: () => CompareRailHandle
  createFileRail?: () => DiffRailHandle
  createPanel?: () => DiffPanelHandle
  createHud?: () => CompareHudHandle
  createMergeAction?: () => CompareMergeActionHandle
}

export type CompareViewBinder = {
  sync(): void
  rebindGateway(gateway: CompareGatewayPort, capabilities: readonly string[]): void
}

/**
 * Extracted out of main.ts (max-lines ratchet, mirrors bind-diff-view.ts): builds the compare-
 * view controller + live loader once, starts/stops the loader on the compareView open/close
 * transition (detected by comparing against the previous sync's view). Focus/winner/select
 * clicks from the controller route straight to the store/loader here, keeping
 * compare-view-controller.ts itself free of store and loader knowledge. Worktree-chrome
 * hide/show is owned by main.ts's subscribe loop (order-independent with the other binders), not
 * by onEnter/onExit here — keeping only the DOM-scoped #compare mount/unmount lifecycle.
 */
export function createCompareViewBinder(deps: BindCompareViewDeps): CompareViewBinder {
  const loader = createCompareLiveLoader({ store: deps.store, gateway: deps.demoGateway })
  let mergeGateway: CompareMergeGatewayPort = deps.demoGateway
  let capabilities: readonly string[] = []

  const controller = createCompareViewController({
    createChildRail: deps.createChildRail ?? createCompareRail,
    createFileRail: deps.createFileRail ?? createDiffRail,
    createPanel: deps.createPanel ?? createDiffPanel,
    createHud: deps.createHud ?? createCompareHud,
    createMergeAction: deps.createMergeAction ?? createCompareMergeAction,
    hud: deps.compareSlot,
    keyboardBarSlot: deps.keyboardBarSlot,
    onFocusChild: (childId) => deps.store.dispatchCompareView({ type: 'focus-child', childId }),
    onSetWinner: (winnerId) => deps.store.dispatchCompareView({ type: 'set-winner', winnerId }),
    onSelectFile: (path) => {
      const compareView = deps.store.get().compareView
      if (compareView.view !== 'open' || compareView.focusedChildId === null) return
      loader.select(compareView.focusedChildId, path)
    },
    onMergeWinner: (syncWorkingTree) => {
      const state = deps.store.get()
      void runCompareMerge(
        state.compareView,
        state.fanOut,
        {
          gateway: mergeGateway,
          dispatch: (action) => deps.store.dispatchCompareView(action)
        },
        syncWorkingTree
      )
    }
  })

  let wasOpen = false
  let pushedHeight = false

  const branchLabelFor = (childId: WorktreeId): string =>
    deps.store.get().graph.nodes.get(childId)?.branch ?? childId

  return {
    sync(): void {
      const state = deps.store.get()
      const { compareView } = state
      const isOpen = compareView.view === 'open'
      const transitionToOpen = isOpen && !wasOpen
      const transitionToClosed = !isOpen && wasOpen
      wasOpen = isOpen
      if (transitionToOpen && compareView.view === 'open') {
        loader.start(compareView.members)
        pushedHeight = deps.heights.goTo('comparar')
      }
      if (transitionToClosed) {
        loader.stop()
        if (pushedHeight) {
          deps.heights.pop()
          pushedHeight = false
        }
      }

      controller.sync(
        compareView,
        state.connection,
        branchLabelFor,
        capabilities.includes(GIT_MERGE_WINNER_CAPABILITY),
        capabilities.includes(GIT_MERGE_WINNER_SYNC_CAPABILITY)
      )
    },
    rebindGateway(gateway: CompareGatewayPort, nextCapabilities: readonly string[]): void {
      loader.rebindGateway(gateway)
      mergeGateway = gateway
      capabilities = nextCapabilities
    }
  }
}
