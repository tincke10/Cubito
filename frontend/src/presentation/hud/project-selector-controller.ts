import type {
  ProjectSelectorAction,
  ProjectSelectorSlice
} from '../../application/project-selector-model'
import type { ReposAction, ReposSlice } from '../../application/repos-model'
import type { RuntimeGateway } from '../../application/ports/runtime-gateway'
import type { ProjectSelectorHandle } from './project-selector-element'
import { projectSelectorViewModel } from './project-selector-view-model'

/** Only the two methods the selector needs — narrow like SpawnGatewayPort. */
export type ProjectSelectorGatewayPort = Pick<RuntimeGateway, 'listRepos' | 'addRepo'>

export type ProjectSelectorControllerDeps = {
  gateway: ProjectSelectorGatewayPort
  createElement: () => ProjectSelectorHandle
  hud: { appendChild(element: unknown): void }
  dispatch: (action: ProjectSelectorAction) => void
  reposDispatch: (action: ReposAction) => void
  /** Frames the camera on the given repo's island (design Area 7). */
  focusIsland: (repoId: string) => void
  /** Fired after a successful addRepo — snappier than waiting for the live-sync poll. */
  refetch: () => Promise<void>
}

export type ProjectSelectorController = {
  sync(selector: ProjectSelectorSlice, repos: ReposSlice): void
  rebindGateway(gateway: ProjectSelectorGatewayPort): void
  dispose(): void
}

/**
 * Owns the ⌘P selector's lifecycle (design Area 4), mirroring spawn-menu-controller.ts: mounts a
 * single HUD element as `selector.view` transitions away from 'closed', refreshes the repo list
 * once per open, and drives `addRepo` on the add-form submit.
 */
export function createProjectSelectorController(
  deps: ProjectSelectorControllerDeps
): ProjectSelectorController {
  let gateway = deps.gateway
  let element: ProjectSelectorHandle | null = null
  let wasClosed = true
  let previousView: ProjectSelectorSlice['view'] = 'closed'
  let currentSlice: ProjectSelectorSlice = { view: 'closed' }

  const handleAddSubmit = async (): Promise<void> => {
    const slice = currentSlice
    if (slice.view !== 'add-form' || slice.status === 'submitting') return
    if (slice.path.trim() === '') return
    deps.dispatch({ type: 'submit-add' })
    try {
      const repo = await gateway.addRepo({ path: slice.path, kind: slice.kind })
      deps.reposDispatch({ type: 'set-active', repoId: repo.id })
      await deps.refetch()
      deps.focusIsland(repo.id)
      deps.dispatch({ type: 'submit-add-ok' })
    } catch (error) {
      deps.dispatch({
        type: 'submit-add-error',
        message: error instanceof Error ? error.message : 'error'
      })
    }
  }

  const mount = (): ProjectSelectorHandle => {
    if (!element) {
      const created = deps.createElement()
      created.onQueryChange((query) => deps.dispatch({ type: 'set-query', query }))
      created.onHighlight((delta) => deps.dispatch({ type: 'move-highlight', delta }))
      created.onActivate((repoId) => {
        deps.reposDispatch({ type: 'set-active', repoId })
        deps.focusIsland(repoId)
        deps.dispatch({ type: 'close' })
      })
      created.onOpenAddForm(() => deps.dispatch({ type: 'open-add-form' }))
      created.onClose(() => deps.dispatch({ type: 'close' }))
      created.onAddFieldChange((field, value) =>
        deps.dispatch({ type: 'update-add-field', field, value })
      )
      created.onAddSubmit(() => void handleAddSubmit())
      created.onAddCancel(() => deps.dispatch({ type: 'back-to-list' }))
      deps.hud.appendChild(created.element)
      element = created
      created.focusQuery()
    }
    return element
  }

  const unmount = (): void => {
    if (!element) return
    element.dispose()
    element = null
  }

  return {
    sync(selector: ProjectSelectorSlice, repos: ReposSlice): void {
      currentSlice = selector
      if (selector.view === 'closed') {
        unmount()
        wasClosed = true
        previousView = 'closed'
        return
      }
      if (wasClosed) {
        void gateway.listRepos().then((list) => deps.reposDispatch({ type: 'set-list', list }))
      }
      wasClosed = false
      const model = projectSelectorViewModel(selector, repos)
      if (model === null) {
        previousView = selector.view
        return
      }
      const mounted = mount()
      mounted.apply(model)
      // display:none force-blurs a focused descendant, so the path input needs an explicit
      // focus() on the list -> add-form transition, mirroring spawn-form's focusFirstField().
      if (selector.view === 'add-form' && previousView !== 'add-form') mounted.focusPath()
      previousView = selector.view
    },
    rebindGateway(newGateway: ProjectSelectorGatewayPort): void {
      gateway = newGateway
    },
    dispose(): void {
      unmount()
    }
  }
}
