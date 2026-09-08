import { syncWorktreeGraph } from './application/sync-worktree-graph'
import { createCamadaMemberPoll } from './application/camada-member-poll'
import { fanOutMemberIds } from './application/fan-out-model'
import type { LiveSyncConnection } from './application/live-worktree-sync'
import type { SceneStore } from './application/scene-store'
import type { RuntimeGateway } from './application/ports/runtime-gateway'
import type { WorktreeId } from './domain/worktree-graph/types'
import { frameLitter, frameLitterOnLayout } from './presentation/camera/camera-framing'
import type { CameraFraming, LitterLayout, Vec3 } from './presentation/camera/camera-framing'
import { createFanOutForm } from './presentation/hud/fan-out-element'
import { createFanOutController } from './presentation/hud/fan-out-controller'
import type { FanOutController } from './presentation/hud/fan-out-controller'
import { runCamadaLeaseSubmit } from './application/fan-out-lease-submit'
import {
  GUI_RUN_LEASE_CAPABILITY,
  GUI_RUN_LEASE_GATES_CAPABILITY
} from './application/runtime-capability-keys'

export type BindFanOutDeps = {
  store: SceneStore
  hud: { appendChild(element: unknown): void }
  nodeCenter: (id: WorktreeId) => Vec3 | null
  animateTo: (framing: CameraFraming, durationMs: number) => void
  focusDurationMs: number
  demoGateway: RuntimeGateway
}

export type FanOutBinder = {
  bind(connection: LiveSyncConnection): void
  sync(): void
}

/**
 * Extracted out of main.ts (max-lines ratchet, mirrors `bindSpawn`/`bindProjects`'s lazy
 * on-first-connect pattern): builds the fan-out controller once, rebinds its gateway (and the
 * `memberPoll` it owns) on every reconnect thereafter.
 */
export function createFanOutBinder(deps: BindFanOutDeps): FanOutBinder {
  let fanOutController: FanOutController | null = null
  let fanOutGateway: RuntimeGateway = deps.demoGateway
  let capabilities: readonly string[] = []
  // Item 2 (corrected W11): reframes as each child lands AND when the layout itself moves (e.g.
  // the post-batch refetch swaps in the host's real positions) — null outside 'running' so
  // reopening the form (or a later camada) never reads a stale layout as growth/movement.
  let lastLitter: LitterLayout | null = null

  return {
    bind(connection: LiveSyncConnection): void {
      fanOutGateway = connection.gateway
      capabilities = connection.capabilities
      if (fanOutController) {
        fanOutController.rebindGateway(connection.gateway)
        return
      }
      fanOutController = createFanOutController({
        gateway: connection.gateway,
        createElement: createFanOutForm,
        hud: deps.hud,
        dispatch: (action) => deps.store.dispatchFanOut(action),
        focusLitter: (memberIds) => {
          const framing = frameLitter(memberIds, deps.nodeCenter)
          deps.animateTo(framing, deps.focusDurationMs)
        },
        memberPoll: createCamadaMemberPoll({
          gateway: connection.gateway,
          store: deps.store,
          gatesCapable: () => capabilities.includes(GUI_RUN_LEASE_GATES_CAPABILITY)
        }),
        refetch: () => syncWorktreeGraph(fanOutGateway, deps.store),
        activeRepoId: () => deps.store.get().repos.activeRepoId,
        leaseCapable: () => capabilities.includes(GUI_RUN_LEASE_CAPABILITY),
        leasePlanner: runCamadaLeaseSubmit
      })
      fanOutController.sync(deps.store.get().fanOut, deps.store.get().graph)
    },
    sync(): void {
      const state = deps.store.get()
      fanOutController?.sync(state.fanOut, state.graph)

      if (state.fanOut.view !== 'running') {
        lastLitter = null
        return
      }
      const memberIds = fanOutMemberIds(state.fanOut)
      const centers: Vec3[] = []
      for (const id of memberIds) {
        const center = deps.nodeCenter(id)
        if (center) centers.push(center)
      }
      const next: LitterLayout = { count: memberIds.length, centers }
      const framing = frameLitterOnLayout(lastLitter, next)
      lastLitter = next
      if (framing) deps.animateTo(framing, deps.focusDurationMs)
    }
  }
}
