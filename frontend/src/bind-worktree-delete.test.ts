import { describe, expect, it, vi } from 'vitest'
import { createWorktreeDeleteBinder } from './bind-worktree-delete'
import { createSceneStore } from './application/scene-store'
import { buildWorktreeGraph } from './domain/worktree-graph/build-graph'
import type { WorktreeDeletePanelHandle } from './presentation/hud/worktree-delete-panel-element'
import type { WorktreeDeletePanelModel } from './presentation/hud/worktree-delete-view-model'

function setup() {
  const store = createSceneStore()
  store.update({
    graph: buildWorktreeGraph([
      {
        id: 'r::/main',
        repoId: 'r',
        branch: 'refs/heads/main',
        parentWorktreeId: null,
        childWorktreeIds: ['r::/a'],
        workspaceStatus: 'in-progress',
        git: { path: '/main', isMainWorktree: true }
      },
      {
        id: 'r::/a',
        repoId: 'r',
        branch: 'refs/heads/a',
        parentWorktreeId: 'r::/main',
        childWorktreeIds: [],
        workspaceStatus: 'in-progress',
        git: { path: '/a', isMainWorktree: false }
      }
    ])
  })
  store.select('r::/a')
  const models: WorktreeDeletePanelModel[] = []
  const callbacks = { confirm: () => undefined as void, cancel: () => undefined as void }
  const panel: WorktreeDeletePanelHandle = {
    root: {} as HTMLElement,
    apply: (model) => models.push(model),
    onConfirm: (cb) => (callbacks.confirm = cb),
    onCancel: (cb) => (callbacks.cancel = cb),
    dispose: vi.fn()
  }
  const hud = { appendChild: vi.fn() }
  const gateway = {
    worktreeRemove: vi.fn(async () => ({ removed: true as const })),
    gitStatus: vi.fn(async () => ({ entries: [], branch: 'a', branchLineTotal: 0 })),
    listWorktrees: vi.fn(async () => []),
    listRepos: vi.fn(async () => []),
    listWorktreePs: vi.fn(async () => [])
  }
  const onSelectionSettled = vi.fn()
  const binder = createWorktreeDeleteBinder({
    store,
    hud,
    demoGateway: gateway,
    onSelectionSettled,
    createPanel: () => panel
  })
  return {
    binder,
    hud,
    models,
    panel,
    gateway,
    confirm: () => callbacks.confirm(),
    cancel: () => callbacks.cancel(),
    onSelectionSettled
  }
}

describe('worktree delete binder', () => {
  it('mounts the panel on request and disposes it on cancel', () => {
    const { binder, hud, panel, cancel, models } = setup()
    expect(binder.isOpen()).toBe(false)
    binder.request('r::/a')
    expect(binder.isOpen()).toBe(true)
    expect(hud.appendChild).toHaveBeenCalledTimes(1)
    expect(models.at(-1)?.visible).toBe(true)
    cancel()
    expect(panel.dispose).toHaveBeenCalled()
    expect(binder.isOpen()).toBe(false)
  })

  it('removes through the rebound gateway and settles the selection on the parent', async () => {
    const { binder, gateway, confirm, onSelectionSettled } = setup()
    const next = { ...gateway, worktreeRemove: vi.fn(async () => ({ removed: true as const })) }
    binder.rebindGateway(next)
    binder.request('r::/a')
    confirm()
    await vi.waitFor(() => expect(onSelectionSettled).toHaveBeenCalled())
    expect(next.worktreeRemove).toHaveBeenCalledWith('r::/a', {})
    expect(gateway.worktreeRemove).not.toHaveBeenCalled()
    expect(onSelectionSettled).toHaveBeenCalledWith(null)
  })
})
