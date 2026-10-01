import { describe, expect, it, vi } from 'vitest'
import { createSourceControlBinder } from './bind-source-control'
import { createSceneStore } from './application/scene-store'
import { buildWorktreeGraph } from './domain/worktree-graph/build-graph'
import type { SourceControlComposerHandle } from './presentation/diff/source-control-composer-element'
import type { SourceControlModel } from './presentation/diff/source-control-view-model'
import type { DiffStageSource } from './bind-diff-view'
import type { SourceControlStatus } from './application/ports/runtime-gateway'

function setup() {
  const store = createSceneStore()
  store.update({
    graph: buildWorktreeGraph([
      {
        id: 'r::/w',
        repoId: 'r',
        branch: 'refs/heads/feat',
        parentWorktreeId: null,
        childWorktreeIds: [],
        workspaceStatus: 'in-progress',
        git: { path: '/w', isMainWorktree: false }
      }
    ])
  })
  const models: SourceControlModel[] = []
  const handlers: { message: (m: string) => void; commit: () => void; push: () => void } = {
    message: () => undefined,
    commit: () => undefined,
    push: () => undefined
  }
  const composer: SourceControlComposerHandle = {
    root: {} as HTMLElement,
    apply: (model) => models.push(model),
    onMessageChange: (cb) => (handlers.message = cb),
    onCommit: (cb) => (handlers.commit = cb),
    onPush: (cb) => (handlers.push = cb),
    onReviewForm: vi.fn(),
    onReviewPrimary: vi.fn(),
    dispose: vi.fn()
  }
  const slot = { appendChild: vi.fn() }
  const stage: { source: DiffStageSource | null } = { source: null }
  const diff = {
    refresh: vi.fn(),
    sync: vi.fn(),
    attachStageSource: (source: DiffStageSource) => (stage.source = source)
  }
  const gateway = {
    gitSourceControlStatus: vi.fn<(worktree: string) => Promise<SourceControlStatus>>(async () => ({
      branch: 'feat',
      entries: [{ path: 'a.ts', area: 'unstaged' }],
      hasUpstream: true,
      ahead: 0,
      behind: 0
    })),
    gitStage: vi.fn(async () => undefined),
    gitUnstage: vi.fn(async () => undefined),
    gitCommit: vi.fn(async () => ({ success: true as const })),
    gitPush: vi.fn(async () => undefined),
    hostedReviewEligibility: vi.fn(async () => {
      throw new Error('no remote')
    }),
    hostedReviewCreate: vi.fn(async () => ({ ok: true as const, url: 'https://x/1' }))
  }
  const binder = createSourceControlBinder({
    store,
    slot,
    demoGateway: gateway,
    diff,
    createComposer: () => composer
  })
  return { store, binder, composer, slot, diff, gateway, stage, handlers, models }
}

describe('source control binder', () => {
  it('loads status when diff mode opens, mounts the composer and exposes stage states', async () => {
    const { store, binder, slot, stage, gateway } = setup()
    store.dispatchDiffView({ type: 'open', nodeId: 'r::/w', baseRef: 'main' })
    binder.sync()
    await vi.waitFor(() => expect(slot.appendChild).toHaveBeenCalledTimes(1))
    expect(gateway.gitSourceControlStatus).toHaveBeenCalledWith('r::/w')
    expect([...(stage.source!.stageStates() ?? [])]).toEqual([['a.ts', 'unstaged']])
  })

  it('does not reload on repeated syncs for the same node, and tears down on close', async () => {
    const { store, binder, composer, gateway } = setup()
    store.dispatchDiffView({ type: 'open', nodeId: 'r::/w', baseRef: 'main' })
    binder.sync()
    binder.sync()
    await vi.waitFor(() => expect(composer.apply).toBeDefined())
    expect(gateway.gitSourceControlStatus).toHaveBeenCalledTimes(1)
    store.dispatchDiffView({ type: 'close' })
    binder.sync()
    expect(composer.dispose).toHaveBeenCalled()
  })

  it('routes a rail toggle to staging and the diff refresh afterwards', async () => {
    const { store, binder, stage, gateway, diff } = setup()
    store.dispatchDiffView({ type: 'open', nodeId: 'r::/w', baseRef: 'main' })
    binder.sync()
    await vi.waitFor(() => expect(stage.source!.stageStates()).toBeDefined())
    stage.source!.toggle('a.ts')
    await vi.waitFor(() => expect(diff.refresh).toHaveBeenCalled())
    expect(gateway.gitStage).toHaveBeenCalledWith('r::/w', ['a.ts'])
  })

  it('commits with the typed message from the composer', async () => {
    const { store, binder, handlers, gateway, stage } = setup()
    gateway.gitSourceControlStatus.mockResolvedValue({
      branch: 'feat',
      entries: [{ path: 'a.ts', area: 'staged' }],
      hasUpstream: true,
      ahead: 0,
      behind: 0
    })
    store.dispatchDiffView({ type: 'open', nodeId: 'r::/w', baseRef: 'main' })
    binder.sync()
    await vi.waitFor(() => expect(stage.source!.stageStates()).toBeDefined())
    handlers.message('feat: y')
    handlers.commit()
    await vi.waitFor(() => expect(gateway.gitCommit).toHaveBeenCalledWith('r::/w', 'feat: y'))
  })
})
