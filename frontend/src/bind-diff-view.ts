import { createDiffViewController } from './presentation/diff/diff-view-controller'
import { createDiffRail } from './presentation/diff/diff-rail-element'
import { createDiffPanel } from './presentation/diff/diff-panel-element'
import { createDiffHud } from './presentation/diff/diff-hud-element'
import { createDiffLiveLoader } from './application/diff-live-loader'
import type { DiffLiveLoaderGatewayPort } from './application/diff-live-loader'
import type { SceneStore } from './application/scene-store'

export type BindDiffViewDeps = {
  store: SceneStore
  diffSlot: { appendChild(element: unknown): void }
  keyboardBarSlot: { appendChild(element: unknown): void }
  demoGateway: DiffLiveLoaderGatewayPort
  /** Worktree HUD/keyboard-bar/scene chrome to hide while the diff view owns the screen
   *  (mirrors bind-system-view.ts) — plain `hidden` toggles. */
  worktreeChrome: readonly { hidden: boolean }[]
}

export type DiffViewBinder = {
  sync(): void
  rebindGateway(gateway: DiffLiveLoaderGatewayPort): void
}

/**
 * Extracted out of main.ts (max-lines ratchet, mirrors bind-system-view.ts): builds the
 * diff-view controller + live loader once, starts/stops/selects on that loader on the diffView
 * open/close/select transitions (detected by comparing against the previous sync's view), and
 * owns the hide/show seam so diff-view-controller.ts stays DOM-scoped to #diff.
 */
export function createDiffViewBinder(deps: BindDiffViewDeps): DiffViewBinder {
  const setChromeHidden = (hidden: boolean): void => {
    for (const el of deps.worktreeChrome) el.hidden = hidden
  }

  const loader = createDiffLiveLoader({ store: deps.store, gateway: deps.demoGateway })

  const controller = createDiffViewController({
    createRail: createDiffRail,
    createPanel: createDiffPanel,
    createHud: createDiffHud,
    hud: deps.diffSlot,
    keyboardBarSlot: deps.keyboardBarSlot,
    onSelect: (path) => loader.select(path),
    onEnter: () => setChromeHidden(true),
    onExit: () => setChromeHidden(false)
  })

  let wasOpen = false

  return {
    sync(): void {
      const state = deps.store.get()
      const { diffView } = state
      const isOpen = diffView.view === 'open'
      const transitionToOpen = isOpen && !wasOpen
      const transitionToClosed = !isOpen && wasOpen
      wasOpen = isOpen
      // start() re-dispatches 'open' (harmless — nothing has run yet at this instant, mirrors
      // bind-system-view.ts), which re-enters sync() synchronously; wasOpen is already updated
      // above, so it won't recurse.
      if (transitionToOpen && diffView.view === 'open') loader.start(diffView.focusedNodeId)
      if (transitionToClosed) loader.stop()

      const selectedId = state.selection.selectedId
      const branchLabel =
        selectedId !== null ? (state.graph.nodes.get(selectedId)?.branch ?? '') : ''
      controller.sync(deps.store.get().diffView, state.connection, branchLabel)
    },
    rebindGateway(gateway: DiffLiveLoaderGatewayPort): void {
      loader.rebindGateway(gateway)
    }
  }
}
