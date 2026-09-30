import type {
  ProjectSelectorAction,
  ProjectSelectorSlice
} from '../../application/project-selector-model'
import type { ReposAction, ReposSlice } from '../../application/repos-model'
import type { RuntimeGateway } from '../../application/ports/runtime-gateway'
import type { ProjectSelectorHandle } from './project-selector-element'
import { projectSelectorViewModel } from './project-selector-view-model'

/** Only the methods the selector needs — narrow like SpawnGatewayPort. */
export type ProjectSelectorGatewayPort = Pick<
  RuntimeGateway,
  'listRepos' | 'addRepo' | 'repoSetupCommand' | 'setRepoSetupCommand'
>

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
  let setupRepo: { id: string; name: string; command: string | null } | null = null
  let setupRequestedFor: string | null = null
  let setupShown = false

  const showSetup = (message = ''): void => {
    if (!element || !setupRepo) return
    setupShown = true
    element.applySetup({ repoName: setupRepo.name, command: setupRepo.command, message })
  }

  // One fetch per (open, active repo); a repo switch or a fresh open re-reads the host.
  const loadSetup = (repos: ReposSlice): void => {
    const active = repos.list.find((repo) => repo.id === repos.activeRepoId)
    if (!active || setupRequestedFor === active.id) return
    setupRequestedFor = active.id
    void gateway
      .repoSetupCommand(`id:${active.id}`)
      .then((command) => {
        if (setupRequestedFor !== active.id) return
        setupRepo = { id: active.id, name: active.displayName, command }
        showSetup()
      })
      .catch(() => {
        if (setupRequestedFor === active.id) setupRequestedFor = null
      })
  }

  const handleSetupSave = async (command: string): Promise<void> => {
    if (!setupRepo) return
    const target = setupRepo
    const trimmed = command.trim()
    try {
      await gateway.setRepoSetupCommand(`id:${target.id}`, trimmed)
      setupRepo = { ...target, command: trimmed === '' ? null : trimmed }
      showSetup('guardado')
    } catch (error) {
      showSetup(`error: ${error instanceof Error ? error.message : 'no se pudo guardar'}`)
    }
  }

  const handleAddSubmit = async (): Promise<void> => {
    const slice = currentSlice
    if (slice.view !== 'add-form' || slice.status === 'submitting') return
    if (slice.path.trim() === '') return
    deps.dispatch({ type: 'submit-add' })
    try {
      const repo = await gateway.addRepo({ path: slice.path, kind: slice.kind })
      deps.reposDispatch({ type: 'set-active', repoId: repo.id })
      const setup = slice.setup?.trim() ?? ''
      let setupError: string | null = null
      if (setup !== '') {
        try {
          await gateway.setRepoSetupCommand(`id:${repo.id}`, setup)
        } catch (error) {
          setupError = error instanceof Error ? error.message : 'error'
        }
      }
      await deps.refetch()
      deps.focusIsland(repo.id)
      deps.dispatch(
        setupError === null
          ? { type: 'submit-add-ok' }
          : {
              type: 'submit-add-error',
              message: `repo agregado, pero el setup no se guardó: ${setupError}`
            }
      )
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
      created.onSetupSave((command) => void handleSetupSave(command))
      deps.hud.appendChild(created.element)
      element = created
      created.focusQuery()
    }
    return element
  }

  const unmount = (): void => {
    setupRepo = null
    setupRequestedFor = null
    setupShown = false
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
      if (selector.view === 'open') {
        loadSetup(repos)
        // Why: re-applying on every sync would clobber a half-typed setup command.
        if (!setupShown) showSetup()
      }
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
