import { createWorktreeDeleteFlow } from './application/worktree-delete-flow'
import type { WorktreeDeleteGatewayPort } from './application/worktree-delete-flow'
import { syncWorktreeGraph } from './application/sync-worktree-graph'
import type { SyncGatewayPort } from './application/sync-worktree-graph'
import type { SceneStore } from './application/scene-store'
import type { WorktreeDeletePort } from './presentation/input/keyboard-controller'
import { createWorktreeDeletePanel } from './presentation/hud/worktree-delete-panel-element'
import type { WorktreeDeletePanelHandle } from './presentation/hud/worktree-delete-panel-element'
import { worktreeDeletePanelModel } from './presentation/hud/worktree-delete-view-model'

type DeleteGateway = WorktreeDeleteGatewayPort & SyncGatewayPort

export type WorktreeDeleteBinder = WorktreeDeletePort & {
  rebindGateway(gateway: DeleteGateway): void
}

/** Extracted out of main.ts (max-lines ratchet): owns the delete flow and its HUD confirm panel. */
export function createWorktreeDeleteBinder(deps: {
  store: SceneStore
  hud: { appendChild(element: unknown): void }
  demoGateway: DeleteGateway
  /** Re-aims the camera once selection left the removed node. */
  onSelectionSettled(selectedId: string | null): void
  createPanel?: () => WorktreeDeletePanelHandle
}): WorktreeDeleteBinder {
  let gateway = deps.demoGateway
  let panel: WorktreeDeletePanelHandle | null = null
  const flow = createWorktreeDeleteFlow({
    store: deps.store,
    gateway: {
      worktreeRemove: (worktree, options) => gateway.worktreeRemove(worktree, options),
      gitStatus: (worktree) => gateway.gitStatus(worktree)
    },
    refreshGraph: () => syncWorktreeGraph(gateway, deps.store),
    afterRemoved: deps.onSelectionSettled
  })

  flow.subscribe((view) => {
    if (view.phase === 'idle') {
      panel?.dispose()
      panel = null
      return
    }
    if (!panel) {
      panel = (deps.createPanel ?? createWorktreeDeletePanel)()
      panel.onConfirm(() => void flow.confirm())
      panel.onCancel(() => void flow.cancel())
      deps.hud.appendChild(panel.root)
    }
    panel.apply(worktreeDeletePanelModel(view))
  })

  return {
    request: (nodeId) => flow.request(nodeId),
    isOpen: () => flow.view().phase === 'open',
    cancel: () => flow.cancel(),
    rebindGateway(next) {
      gateway = next
    }
  }
}
