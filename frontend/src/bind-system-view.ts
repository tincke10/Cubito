import { createSystemViewController } from './presentation/system/system-view-controller'
import { createSystemGraph } from './presentation/system/system-graph-element'
import { createActivityFeed } from './presentation/system/activity-feed-element'
import { createSystemHud } from './presentation/system/system-hud-element'
import { createSystemLiveDriver } from './application/system-live-driver'
import { createSystemSnapshotPoll } from './application/system-snapshot-poll'
import type { SystemSnapshotPollGatewayPort } from './application/system-snapshot-poll'
import type { SceneStore } from './application/scene-store'
import type { SystemGraphPort } from './application/ports/system-graph-port'
import type { SystemGraphHandle } from './presentation/system/system-graph-element'
import type { ActivityFeedHandle } from './presentation/system/activity-feed-element'
import type { SystemHudHandle } from './presentation/system/system-hud-element'

export type BindSystemViewDeps = {
  store: SceneStore
  systemSlot: { appendChild(element: unknown): void }
  keyboardBarSlot: { appendChild(element: unknown): void }
  demoGraphPort: SystemGraphPort
  demoGateway: SystemSnapshotPollGatewayPort
  /** DOM element factory overrides — tests substitute fakes, production uses the defaults. */
  createGraph?: () => SystemGraphHandle
  createFeed?: () => ActivityFeedHandle
  createHud?: () => SystemHudHandle
}

export type SystemViewBinder = {
  sync(): void
  rebindGateway(gateway: SystemSnapshotPollGatewayPort): void
}

/**
 * Extracted out of main.ts (max-lines ratchet, mirrors bind-fan-out.ts): builds the system-view
 * controller + BOTH drivers once — the scripted stub (`createSystemLiveDriver` over
 * `demoGraphPort`, untouched fallback path) and the real gateway-backed poll
 * (`createSystemSnapshotPoll`) — starting/stopping the right one on the systemView open/close
 * transition (detected by comparing against the previous sync's view). Worktree-chrome
 * hide/show is owned by main.ts's subscribe loop (order-independent with bind-diff-view.ts), not
 * by onEnter/onExit here — keeping only the DOM-scoped #system mount/unmount lifecycle.
 */
export function createSystemViewBinder(deps: BindSystemViewDeps): SystemViewBinder {
  const controller = createSystemViewController({
    createGraph: deps.createGraph ?? createSystemGraph,
    createFeed: deps.createFeed ?? createActivityFeed,
    createHud: deps.createHud ?? createSystemHud,
    hud: deps.systemSlot,
    keyboardBarSlot: deps.keyboardBarSlot
  })
  const driver = createSystemLiveDriver({ store: deps.store, port: deps.demoGraphPort })

  // Set once a real connection rebinds the poll's gateway; stays true across later opens/closes
  // (mirrors DiffViewBinder — no "unbind" on disconnect), so `pnpm dev` offline stays on the
  // stub path with no gateway ever set.
  let hasRealGateway = false
  const poll = createSystemSnapshotPoll({
    store: deps.store,
    gateway: deps.demoGateway,
    onUnsupported: () => {
      // old host, no `system.snapshot` — fall back to the scripted demo for this open.
      const systemView = deps.store.get().systemView
      if (systemView.view === 'open') driver.start(systemView.focusedNodeId)
    }
  })

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
      if (transitionToOpen && systemView.view === 'open') {
        // per-open attempt (not a one-time probe) — a later open retries the real gateway even
        // if an earlier one fell back, so a since-upgraded host is picked up automatically.
        if (hasRealGateway) poll.start(systemView.focusedNodeId)
        else driver.start(systemView.focusedNodeId)
      }
      if (transitionToClosed) {
        poll.stop()
        driver.stop()
      }

      const selectedId = state.selection.selectedId
      const branchLabel =
        selectedId !== null ? (state.graph.nodes.get(selectedId)?.branch ?? '') : ''
      controller.sync(deps.store.get().systemView, state.connection, branchLabel)
    },
    rebindGateway(gateway: SystemSnapshotPollGatewayPort): void {
      hasRealGateway = true
      poll.rebindGateway(gateway)
    }
  }
}
