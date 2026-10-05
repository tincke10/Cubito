import { plainFailure } from '../../application/i18n/user-facing-error'
import { describe, expect, it, vi } from 'vitest'
import { createProjectSelectorController } from './project-selector-controller'
import { repoSetupSaved } from '../../application/repo-setup-saved'
import type { ProjectSelectorControllerDeps } from './project-selector-controller'
import {
  emptyProjectSelectorSlice,
  reduceProjectSelector
} from '../../application/project-selector-model'
import type {
  ProjectSelectorAction,
  ProjectSelectorSlice
} from '../../application/project-selector-model'
import { emptyReposSlice, reduceRepos } from '../../application/repos-model'
import type { ReposAction, ReposSlice } from '../../application/repos-model'
import type { RepoSetupInfo, RepoSummary } from '../../application/ports/runtime-gateway'
import type { ProjectSelectorHandle, ProjectSelectorSetupModel } from './project-selector-element'

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

type FakeSelector = ProjectSelectorHandle & {
  applyCalls: number
  disposed: boolean
  focused: boolean
  emitQueryChange(query: string): void
  emitHighlight(delta: number): void
  emitActivate(repoId: string): void
  emitOpenAddForm(): void
  emitClose(): void
  emitAddFieldChange(field: 'path' | 'kind' | 'setup', value: string): void
  emitSetupSave(command: string): void
  emitAddSubmit(): void
  emitAddCancel(): void
}

const createFakeSelector = (): FakeSelector => {
  let queryCb: ((query: string) => void) | null = null
  let highlightCb: ((delta: number) => void) | null = null
  let activateCb: ((repoId: string) => void) | null = null
  let openAddFormCb: (() => void) | null = null
  let closeCb: (() => void) | null = null
  let addFieldCb: ((field: 'path' | 'kind' | 'setup', value: string) => void) | null = null
  let setupSaveCb: ((command: string) => void) | null = null
  let addSubmitCb: (() => void) | null = null
  let addCancelCb: (() => void) | null = null

  const selector: FakeSelector = {
    element: {} as HTMLElement,
    applyCalls: 0,
    disposed: false,
    focused: false,
    apply: vi.fn(() => selector.applyCalls++),
    onQueryChange(cb) {
      queryCb = cb
      return () => (queryCb = null)
    },
    onHighlight(cb) {
      highlightCb = cb
      return () => (highlightCb = null)
    },
    onActivate(cb) {
      activateCb = cb
      return () => (activateCb = null)
    },
    onOpenAddForm(cb) {
      openAddFormCb = cb
      return () => (openAddFormCb = null)
    },
    onClose(cb) {
      closeCb = cb
      return () => (closeCb = null)
    },
    onAddFieldChange(cb) {
      addFieldCb = cb
      return () => (addFieldCb = null)
    },
    onAddSubmit(cb) {
      addSubmitCb = cb
      return () => (addSubmitCb = null)
    },
    onAddCancel(cb) {
      addCancelCb = cb
      return () => (addCancelCb = null)
    },
    applySetup: vi.fn<(model: ProjectSelectorSetupModel | null) => void>(),
    onSetupSave(cb) {
      setupSaveCb = cb
      return () => (setupSaveCb = null)
    },
    emitSetupSave(command) {
      setupSaveCb?.(command)
    },
    focusQuery: vi.fn(() => (selector.focused = true)),
    focusPath: vi.fn(),
    dispose: vi.fn(() => (selector.disposed = true)),
    emitQueryChange(query) {
      queryCb?.(query)
    },
    emitHighlight(delta) {
      highlightCb?.(delta)
    },
    emitActivate(repoId) {
      activateCb?.(repoId)
    },
    emitOpenAddForm() {
      openAddFormCb?.()
    },
    emitClose() {
      closeCb?.()
    },
    emitAddFieldChange(field, value) {
      addFieldCb?.(field, value)
    },
    emitAddSubmit() {
      addSubmitCb?.()
    },
    emitAddCancel() {
      addCancelCb?.()
    }
  }
  return selector
}

const REPO_A: RepoSummary = { id: 'repo-a', path: '/a', displayName: 'A', kind: 'git' }

const createFakeGateway = () => ({
  listRepos: vi.fn<() => Promise<readonly RepoSummary[]>>(async () => [REPO_A]),
  addRepo: vi.fn<(input: { path: string; kind?: 'git' | 'folder' }) => Promise<RepoSummary>>(
    async () => ({ id: 'repo-new', path: '/new', displayName: 'New', kind: 'git' })
  ),
  repoSetupInfo: vi.fn<(repo: string) => Promise<RepoSetupInfo>>(async () => ({
    local: null,
    shared: null,
    known: true
  })),
  setRepoSetupCommand: vi.fn<(repo: string, command: string) => Promise<void>>(async () => {})
})

const setup = () => {
  const gateway = createFakeGateway()
  const selectors: FakeSelector[] = []
  const hud = { appendChild: vi.fn() }
  const dispatch = vi.fn<(action: ProjectSelectorAction) => void>()
  const reposDispatch = vi.fn<(action: ReposAction) => void>()
  const focusIsland = vi.fn()
  const refetch = vi.fn(async () => {})
  const deps: ProjectSelectorControllerDeps = {
    gateway,
    createElement: () => {
      const s = createFakeSelector()
      selectors.push(s)
      return s
    },
    hud,
    dispatch,
    reposDispatch,
    focusIsland,
    refetch
  }
  const controller = createProjectSelectorController(deps)
  return { controller, gateway, selectors, hud, dispatch, reposDispatch, focusIsland, refetch }
}

const openSlice = (): ProjectSelectorSlice =>
  reduceProjectSelector(emptyProjectSelectorSlice(), { type: 'open' })

const addFormWith = (command: string): ProjectSelectorSlice => ({
  view: 'add-form',
  path: '/abs/new',
  kind: 'git',
  status: 'idle',
  setup: command
})

describe('createProjectSelectorController — repo setup', () => {
  const activeA = { list: [REPO_A], activeRepoId: 'repo-a' }

  it('loads the active repo setup once per open and shows it in the selector', async () => {
    const { controller, gateway, selectors } = setup()
    gateway.repoSetupInfo.mockResolvedValue({ local: 'pnpm install', shared: null, known: true })
    controller.sync(openSlice(), activeA)
    controller.sync(openSlice(), activeA)
    await flush()
    expect(gateway.repoSetupInfo).toHaveBeenCalledOnce()
    expect(gateway.repoSetupInfo).toHaveBeenCalledWith('id:repo-a')
    expect(selectors[0]!.applySetup).toHaveBeenLastCalledWith({
      repoName: 'A',
      command: 'pnpm install',
      sharedCommand: null,
      message: null
    })
  })

  it('surfaces the orca.yaml command as read-only, and does not re-probe after a failed read', async () => {
    const { controller, gateway, selectors } = setup()
    gateway.repoSetupInfo.mockResolvedValueOnce({ local: null, shared: 'pnpm i', known: true })
    controller.sync(openSlice(), activeA)
    await flush()
    expect(selectors[0]!.applySetup).toHaveBeenLastCalledWith(
      expect.objectContaining({ command: null, sharedCommand: 'pnpm i' })
    )
    controller.sync({ view: 'closed' }, activeA)
    gateway.repoSetupInfo.mockClear()
    gateway.repoSetupInfo.mockRejectedValue(new Error('down'))
    controller.sync(openSlice(), activeA)
    await flush()
    controller.sync(openSlice(), activeA)
    controller.sync(openSlice(), activeA)
    expect(gateway.repoSetupInfo).toHaveBeenCalledOnce()
  })

  it('does not re-apply the setup section on later syncs (keeps a half-typed command)', async () => {
    const { controller, selectors } = setup()
    controller.sync(openSlice(), activeA)
    await flush()
    controller.sync(openSlice(), activeA)
    controller.sync(openSlice(), activeA)
    expect(selectors[0]!.applySetup).toHaveBeenCalledOnce()
  })

  it('does not show the setup section without an active repo', () => {
    const { controller, gateway, selectors } = setup()
    controller.sync(openSlice(), emptyReposSlice())
    expect(gateway.repoSetupInfo).not.toHaveBeenCalled()
    expect(selectors[0]!.applySetup).not.toHaveBeenCalled()
  })

  it('saves the typed command for the active repo and confirms it', async () => {
    const { controller, gateway, selectors } = setup()
    controller.sync(openSlice(), activeA)
    await flush()
    selectors[0]!.emitSetupSave('  pnpm install ')
    await flush()
    expect(gateway.setRepoSetupCommand).toHaveBeenCalledWith('id:repo-a', 'pnpm install')
    expect(selectors[0]!.applySetup).toHaveBeenLastCalledWith({
      repoName: 'A',
      command: 'pnpm install',
      sharedCommand: null,
      message: plainFailure('guardado')
    })
  })

  it('signals a saved setup so open forms drop their stale hint', async () => {
    const emit = vi.spyOn(repoSetupSaved, 'emit')
    const { controller, selectors } = setup()
    controller.sync(openSlice(), activeA)
    await flush()
    selectors[0]!.emitSetupSave('pnpm install')
    await flush()
    expect(emit).toHaveBeenCalledOnce()
    emit.mockRestore()
  })

  it('reports a save failure in the setup section', async () => {
    const { controller, gateway, selectors } = setup()
    gateway.setRepoSetupCommand.mockRejectedValue(new Error('boom'))
    controller.sync(openSlice(), activeA)
    await flush()
    selectors[0]!.emitSetupSave('x')
    await flush()
    expect(selectors[0]!.applySetup).toHaveBeenLastCalledWith(
      expect.objectContaining({
        message: { lead: 'no se pudo guardar el setup', detail: 'boom' }
      })
    )
  })

  it('persists the add-form setup on the new repo after adding it', async () => {
    const { controller, gateway, selectors, dispatch } = setup()
    controller.sync(addFormWith(' pnpm install '), emptyReposSlice())
    selectors[0]!.emitAddSubmit()
    await flush()
    expect(gateway.setRepoSetupCommand).toHaveBeenCalledWith('id:repo-new', 'pnpm install')
    expect(dispatch).toHaveBeenCalledWith({ type: 'submit-add-ok' })
  })

  it('skips the setup write when the add-form setup is blank', async () => {
    const { controller, gateway, selectors } = setup()
    controller.sync(addFormWith('  '), emptyReposSlice())
    selectors[0]!.emitAddSubmit()
    await flush()
    expect(gateway.setRepoSetupCommand).not.toHaveBeenCalled()
  })

  it('reports a setup write failure after the repo was already added', async () => {
    const { controller, gateway, selectors, dispatch, refetch } = setup()
    gateway.setRepoSetupCommand.mockRejectedValue(new Error('boom'))
    controller.sync(addFormWith('pnpm install'), emptyReposSlice())
    selectors[0]!.emitAddSubmit()
    await flush()
    expect(refetch).toHaveBeenCalledOnce()
    expect(dispatch).toHaveBeenCalledWith({
      type: 'submit-add-error',
      message: { lead: 'repo agregado, pero no se guardó el setup', detail: 'boom' }
    })
    expect(dispatch).not.toHaveBeenCalledWith({ type: 'submit-add-ok' })
  })
})

describe('createProjectSelectorController', () => {
  it('does nothing when the slice is closed', () => {
    const { controller, selectors } = setup()
    controller.sync(emptyProjectSelectorSlice(), emptyReposSlice())
    expect(selectors).toHaveLength(0)
  })

  it('mounts into the hud, applies the view model, and focuses the query on open', () => {
    const { controller, selectors, hud } = setup()
    controller.sync(openSlice(), emptyReposSlice())
    expect(selectors).toHaveLength(1)
    expect(hud.appendChild).toHaveBeenCalledWith(selectors[0]!.element)
    expect(selectors[0]!.applyCalls).toBe(1)
    expect(selectors[0]!.focused).toBe(true)
  })

  it('unmounts when closing', () => {
    const { controller, selectors } = setup()
    controller.sync(openSlice(), emptyReposSlice())
    controller.sync(emptyProjectSelectorSlice(), emptyReposSlice())
    expect(selectors[0]!.disposed).toBe(true)
  })

  it('fetches the repo list exactly once per open and dispatches set-list', async () => {
    const { controller, gateway, reposDispatch } = setup()
    controller.sync(openSlice(), emptyReposSlice())
    await flush()
    expect(gateway.listRepos).toHaveBeenCalledOnce()
    expect(reposDispatch).toHaveBeenCalledWith({ type: 'set-list', list: [REPO_A] })

    reposDispatch.mockClear()
    gateway.listRepos.mockClear()
    controller.sync(openSlice(), emptyReposSlice()) // still open, no re-fetch
    await flush()
    expect(gateway.listRepos).not.toHaveBeenCalled()
  })

  it('re-fetches on the next open after closing', async () => {
    const { controller, gateway } = setup()
    controller.sync(openSlice(), emptyReposSlice())
    await flush()
    controller.sync(emptyProjectSelectorSlice(), emptyReposSlice())
    gateway.listRepos.mockClear()
    controller.sync(openSlice(), emptyReposSlice())
    await flush()
    expect(gateway.listRepos).toHaveBeenCalledOnce()
  })

  it('wires query/highlight changes from the element to dispatch', () => {
    const { controller, selectors, dispatch } = setup()
    controller.sync(openSlice(), emptyReposSlice())
    selectors[0]!.emitQueryChange('cubi')
    expect(dispatch).toHaveBeenCalledWith({ type: 'set-query', query: 'cubi' })
    selectors[0]!.emitHighlight(1)
    expect(dispatch).toHaveBeenCalledWith({ type: 'move-highlight', delta: 1 })
  })

  it('activate sets the active repo, frames the camera on its island, and closes the selector', () => {
    const { controller, selectors, reposDispatch, focusIsland, dispatch } = setup()
    controller.sync(openSlice(), emptyReposSlice())
    selectors[0]!.emitActivate('repo-a')
    expect(reposDispatch).toHaveBeenCalledWith({ type: 'set-active', repoId: 'repo-a' })
    expect(focusIsland).toHaveBeenCalledWith('repo-a')
    expect(dispatch).toHaveBeenCalledWith({ type: 'close' })
  })

  it('open-add-form and close/cancel events dispatch the matching actions', () => {
    const { controller, selectors, dispatch } = setup()
    controller.sync(openSlice(), emptyReposSlice())
    selectors[0]!.emitOpenAddForm()
    expect(dispatch).toHaveBeenCalledWith({ type: 'open-add-form' })
    selectors[0]!.emitClose()
    expect(dispatch).toHaveBeenCalledWith({ type: 'close' })
    selectors[0]!.emitAddCancel()
    expect(dispatch).toHaveBeenCalledWith({ type: 'back-to-list' })
  })

  it('focuses the path input on the list -> add-form transition (display:none force-blurs it otherwise)', () => {
    const { controller, selectors } = setup()
    controller.sync(openSlice(), emptyReposSlice())
    expect(selectors[0]!.focusPath).not.toHaveBeenCalled()
    const addFormSlice = reduceProjectSelector(openSlice(), { type: 'open-add-form' })
    controller.sync(addFormSlice, emptyReposSlice())
    expect(selectors[0]!.focusPath).toHaveBeenCalledOnce()
  })

  it('does not re-focus the path input on subsequent syncs while already in the add-form', () => {
    const { controller, selectors } = setup()
    controller.sync(openSlice(), emptyReposSlice())
    const addFormSlice = reduceProjectSelector(openSlice(), { type: 'open-add-form' })
    controller.sync(addFormSlice, emptyReposSlice())
    expect(selectors[0]!.focusPath).toHaveBeenCalledOnce()
    const typingSlice = reduceProjectSelector(addFormSlice, {
      type: 'update-add-field',
      field: 'path',
      value: '/abs/x'
    })
    controller.sync(typingSlice, emptyReposSlice())
    controller.sync(typingSlice, emptyReposSlice())
    expect(selectors[0]!.focusPath).toHaveBeenCalledOnce()
  })

  it('wires add-form field changes to update-add-field dispatches', () => {
    const { controller, selectors, dispatch } = setup()
    const addFormSlice = reduceProjectSelector(openSlice(), { type: 'open-add-form' })
    controller.sync(addFormSlice, emptyReposSlice())
    selectors[0]!.emitAddFieldChange('path', '/abs/x')
    expect(dispatch).toHaveBeenCalledWith({
      type: 'update-add-field',
      field: 'path',
      value: '/abs/x'
    })
  })

  it('add submit success: calls addRepo, sets the new repo active, refetches, frames its island, and closes', async () => {
    const { controller, selectors, gateway, dispatch, reposDispatch, refetch, focusIsland } =
      setup()
    let slice = reduceProjectSelector(openSlice(), { type: 'open-add-form' })
    slice = reduceProjectSelector(slice, {
      type: 'update-add-field',
      field: 'path',
      value: '/abs/new'
    })
    controller.sync(slice, emptyReposSlice())

    selectors[0]!.emitAddSubmit()
    expect(dispatch).toHaveBeenCalledWith({ type: 'submit-add' })
    await flush()

    expect(gateway.addRepo).toHaveBeenCalledWith({ path: '/abs/new', kind: 'git' })
    expect(reposDispatch).toHaveBeenCalledWith({ type: 'set-active', repoId: 'repo-new' })
    expect(refetch).toHaveBeenCalledOnce()
    expect(focusIsland).toHaveBeenCalledWith('repo-new')
    expect(dispatch).toHaveBeenCalledWith({ type: 'submit-add-ok' })
  })

  it('add submit failure: dispatches submit-add-error, no refetch, no active-repo change', async () => {
    const { controller, selectors, gateway, dispatch, reposDispatch, refetch } = setup()
    gateway.addRepo.mockRejectedValueOnce(new Error('no es un repo git'))
    let slice = reduceProjectSelector(openSlice(), { type: 'open-add-form' })
    slice = reduceProjectSelector(slice, {
      type: 'update-add-field',
      field: 'path',
      value: '/abs/x'
    })
    controller.sync(slice, emptyReposSlice())

    selectors[0]!.emitAddSubmit()
    await flush()

    expect(dispatch).toHaveBeenCalledWith({
      type: 'submit-add-error',
      message: { lead: 'no se pudo agregar el proyecto', detail: 'no es un repo git' }
    })
    expect(refetch).not.toHaveBeenCalled()
    expect(reposDispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'set-active' }))
  })

  it('add submit is a no-op with a blank path', async () => {
    const { controller, selectors, gateway, dispatch } = setup()
    const slice = reduceProjectSelector(openSlice(), { type: 'open-add-form' })
    controller.sync(slice, emptyReposSlice())
    selectors[0]!.emitAddSubmit()
    await flush()
    expect(gateway.addRepo).not.toHaveBeenCalled()
    expect(dispatch).not.toHaveBeenCalledWith({ type: 'submit-add' })
  })

  it('applies the correct model with a populated repos slice', () => {
    const { controller, selectors } = setup()
    const repos: ReposSlice = reduceRepos(emptyReposSlice(), { type: 'set-list', list: [REPO_A] })
    controller.sync(openSlice(), repos)
    expect(selectors[0]!.apply).toHaveBeenCalledWith(
      expect.objectContaining({
        view: 'list',
        rows: [expect.objectContaining({ repoId: 'repo-a' })]
      })
    )
  })

  it('rebindGateway swaps the gateway used by a subsequent addRepo submit', async () => {
    const { controller, selectors, dispatch } = setup()
    const newGateway = createFakeGateway()
    controller.rebindGateway(newGateway)
    let slice = reduceProjectSelector(openSlice(), { type: 'open-add-form' })
    slice = reduceProjectSelector(slice, {
      type: 'update-add-field',
      field: 'path',
      value: '/abs/x'
    })
    controller.sync(slice, emptyReposSlice())
    selectors[0]!.emitAddSubmit()
    await flush()
    expect(newGateway.addRepo).toHaveBeenCalledOnce()
    expect(dispatch).toHaveBeenCalledWith({ type: 'submit-add-ok' })
  })

  it('dispose unmounts whatever is currently mounted', () => {
    const { controller, selectors } = setup()
    controller.sync(openSlice(), emptyReposSlice())
    controller.dispose()
    expect(selectors[0]!.disposed).toBe(true)
  })
})
