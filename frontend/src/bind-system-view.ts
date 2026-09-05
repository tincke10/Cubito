import { createSystemViewController } from './presentation/system/system-view-controller'
import { createSystemGraph } from './presentation/system/system-graph-element'
import { createActivityFeed } from './presentation/system/activity-feed-element'
import { createSystemHud } from './presentation/system/system-hud-element'
import { createSystemLiveDriver } from './application/system-live-driver'
import type { SceneStore } from './application/scene-store'
import type { SystemGraphPort } from './application/ports/system-graph-port'

export type BindSystemViewDeps = {
  store: SceneStore
  systemSlot: { appendChild(element: unknown): void }
  keyboardBarSlot: { appendChild(element: unknown): void }
  demoGraphPort: SystemGraphPort
  /** Worktree HUD/keyboard-bar/scene chrome to hide while the system view owns the screen
   *  (design: "hide worktree #hud/#keyboard-bar + graphView group") — plain `hidden` toggles. */
  worktreeChrome: readonly { hidden: boolean }[]
}

export type SystemViewBinder = { sync(): void }

/**
 * Extracted out of main.ts (max-lines ratchet, mirrors bind-fan-out.ts): builds the system-view
 * controller + live driver once, starts/stops the driver on the systemView open/close transition
 * (detected by comparing against the previous sync's view), and owns the hide/show seam so
 * system-view-controller.ts stays DOM-scoped to #system (SV-601).
 */
export function createSystemViewBinder(deps: BindSystemViewDeps): SystemViewBinder {
  const setChromeHidden = (hidden: boolean): void => {
    for (const el of deps.worktreeChrome) el.hidden = hidden
  }

  const controller = createSystemViewController({
    createGraph: createSystemGraph,
    createFeed: createActivityFeed,
    createHud: createSystemHud,
    hud: deps.systemSlot,
    keyboardBarSlot: deps.keyboardBarSlot,
    onEnter: () => setChromeHidden(true),
    onExit: () => setChromeHidden(false)
  })
  const driver = createSystemLiveDriver({ store: deps.store, port: deps.demoGraphPort })

  let wasOpen = false

  return {
    sync(): void {
      const state = deps.store.get()
      const { systemView } = state
      const isOpen = systemView.view === 'open'
      const transitionToOpen = isOpen && !wasOpen
      const transitionToClosed = !isOpen && wasOpen
      wasOpen = isOpen
      // start() re-dispatches 'open' (harmless — nothing has run yet at this instant), which
      // re-enters sync() synchronously; wasOpen is already updated above, so it won't recurse.
      if (transitionToOpen && systemView.view === 'open') driver.start(systemView.focusedNodeId)
      if (transitionToClosed) driver.stop()

      const selectedId = state.selection.selectedId
      const branchLabel =
        selectedId !== null ? (state.graph.nodes.get(selectedId)?.branch ?? '') : ''
      controller.sync(deps.store.get().systemView, state.connection, branchLabel)
    }
  }
}
