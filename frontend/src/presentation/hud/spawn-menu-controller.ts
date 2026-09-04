import type { Vec3 } from '../camera/camera-framing'
import type { WorktreeGraph, WorktreeId } from '../../domain/worktree-graph/types'
import type { SpawnMenuAction, SpawnMenuSlice } from '../../application/spawn-menu-model'
import { toCreateWorktreeInput } from '../../application/spawn-menu-model'
import type { RuntimeGateway } from '../../application/ports/runtime-gateway'
import type { SpawnMenuHandle } from './spawn-menu-element'
import type { SpawnFormHandle } from './spawn-form-element'
import { spawnViewModel } from './spawn-view-model'

/** Only the two methods spawn needs — narrow like the other controller ports in this dir. */
export type SpawnGatewayPort = Pick<RuntimeGateway, 'listRepos' | 'createWorktree'>

export type SpawnMenuControllerDeps = {
  gateway: SpawnGatewayPort
  createMenu: () => SpawnMenuHandle
  createForm: () => SpawnFormHandle
  labelLayer: { add(object: unknown): void; remove(object: unknown): void }
  hud: { appendChild(element: unknown): void }
  dispatch: (action: SpawnMenuAction) => void
  nodeCenter: (nodeId: WorktreeId) => Vec3 | null
  /** Fired after a successful create — snappier than waiting for the 2s live-sync poll. */
  refetch: () => Promise<void>
  /** Injectable for deterministic tests; defaults to the real UUID generator. */
  generateMutationId?: () => string
}

export type SpawnMenuController = {
  sync(spawnMenu: SpawnMenuSlice, graph: WorktreeGraph): void
  tick(): void
  rebindGateway(gateway: SpawnGatewayPort): void
  dispose(): void
}

/**
 * Owns the spawn radial/form lifecycle (design Area 3), mirroring terminal-panel-controller.ts:
 * mounts/unmounts the CSS2DObject radial or the HUD form as `spawnMenu.view` changes, resolves
 * the repo selector once via `listRepos()`, and drives `createWorktree` on submit.
 */
export function createSpawnMenuController(deps: SpawnMenuControllerDeps): SpawnMenuController {
  let gateway = deps.gateway
  let menu: SpawnMenuHandle | null = null
  let form: SpawnFormHandle | null = null
  let currentNodeId: WorktreeId | null = null
  let currentSlice: SpawnMenuSlice = { view: 'closed', repoSelector: null }
  let repoFetchInFlight = false

  const generateMutationId = deps.generateMutationId ?? (() => crypto.randomUUID())

  const unmountMenu = (): void => {
    if (!menu) return
    deps.labelLayer.remove(menu.object)
    menu.dispose()
    menu = null
    currentNodeId = null
  }

  const unmountForm = (): void => {
    if (!form) return
    form.dispose()
    form = null
  }

  const mountMenu = (): SpawnMenuHandle => {
    if (!menu) {
      menu = deps.createMenu()
      deps.labelLayer.add(menu.object)
    }
    return menu
  }

  const mountForm = (): SpawnFormHandle => {
    if (!form) {
      const created = deps.createForm()
      created.onFieldChange((field, value) => deps.dispatch({ type: 'update-field', field, value }))
      created.onCancel(() => deps.dispatch({ type: 'cancel' }))
      created.onSubmit(() => void handleSubmit())
      deps.hud.appendChild(created.element)
      form = created
      created.focusFirstField()
    }
    return form
  }

  const maybeFetchRepoSelector = (slice: SpawnMenuSlice): void => {
    if (slice.view === 'closed' || slice.repoSelector !== null || repoFetchInFlight) return
    repoFetchInFlight = true
    void gateway
      .listRepos()
      .then((repos) => {
        const first = repos[0]
        if (first) deps.dispatch({ type: 'set-repo-selector', repoSelector: `id:${first.id}` })
      })
      .finally(() => {
        repoFetchInFlight = false
      })
  }

  const handleSubmit = async (): Promise<void> => {
    const slice = currentSlice
    if (slice.view !== 'form' || slice.status === 'submitting') return
    if (slice.fields.name.trim() === '') return
    deps.dispatch({ type: 'submit' })
    if (slice.repoSelector === null) {
      deps.dispatch({ type: 'submit-error', message: 'repositorio aún no resuelto' })
      return
    }
    const input = {
      ...toCreateWorktreeInput(slice.fields, slice.parentId, slice.repoSelector),
      clientMutationId: generateMutationId()
    }
    try {
      await gateway.createWorktree(input)
      deps.dispatch({ type: 'submit-ok' })
      await deps.refetch()
    } catch (error) {
      deps.dispatch({
        type: 'submit-error',
        message: error instanceof Error ? error.message : 'error'
      })
    }
  }

  return {
    sync(spawnMenu: SpawnMenuSlice, graph: WorktreeGraph): void {
      currentSlice = spawnMenu
      maybeFetchRepoSelector(spawnMenu)
      const model = spawnViewModel(spawnMenu, graph)
      if (model === null) {
        unmountMenu()
        unmountForm()
        return
      }
      if (model.view === 'radial') {
        unmountForm()
        currentNodeId = spawnMenu.view === 'radial' ? spawnMenu.nodeId : null
        mountMenu().apply(model)
        return
      }
      unmountMenu()
      mountForm().apply(model)
    },
    tick(): void {
      if (!menu || currentNodeId === null) return
      const center = deps.nodeCenter(currentNodeId)
      if (!center) return
      menu.object.position.set(center.x, center.y, center.z)
    },
    rebindGateway(newGateway: SpawnGatewayPort): void {
      gateway = newGateway
    },
    dispose(): void {
      unmountMenu()
      unmountForm()
    }
  }
}
