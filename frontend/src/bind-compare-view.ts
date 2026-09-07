import { createCompareViewController } from './presentation/compare/compare-view-controller'
import { createCompareRail } from './presentation/compare/compare-rail-element'
import { createDiffRail } from './presentation/diff/diff-rail-element'
import { createDiffPanel } from './presentation/diff/diff-panel-element'
import { createCompareHud } from './presentation/compare/compare-hud-element'
import { createCompareLiveLoader } from './application/compare-live-loader'
import type { CompareLiveLoaderGatewayPort } from './application/compare-live-loader'
import type { SceneStore } from './application/scene-store'
import type { WorktreeId } from './domain/worktree-graph/types'

export type BindCompareViewDeps = {
  store: SceneStore
  compareSlot: { appendChild(element: unknown): void }
  keyboardBarSlot: { appendChild(element: unknown): void }
  demoGateway: CompareLiveLoaderGatewayPort
}

export type CompareViewBinder = {
  sync(): void
  rebindGateway(gateway: CompareLiveLoaderGatewayPort): void
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

  const controller = createCompareViewController({
    createChildRail: createCompareRail,
    createFileRail: createDiffRail,
    createPanel: createDiffPanel,
    createHud: createCompareHud,
    hud: deps.compareSlot,
    keyboardBarSlot: deps.keyboardBarSlot,
    onFocusChild: (childId) => deps.store.dispatchCompareView({ type: 'focus-child', childId }),
    onSetWinner: (winnerId) => deps.store.dispatchCompareView({ type: 'set-winner', winnerId }),
    onSelectFile: (path) => {
      const compareView = deps.store.get().compareView
      if (compareView.view !== 'open' || compareView.focusedChildId === null) return
      loader.select(compareView.focusedChildId, path)
    }
  })

  let wasOpen = false

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
      if (transitionToOpen && compareView.view === 'open') loader.start(compareView.members)
      if (transitionToClosed) loader.stop()

      controller.sync(compareView, state.connection, branchLabelFor)
    },
    rebindGateway(gateway: CompareLiveLoaderGatewayPort): void {
      loader.rebindGateway(gateway)
    }
  }
}
