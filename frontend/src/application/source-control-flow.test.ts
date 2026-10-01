import { describe, expect, it, vi } from 'vitest'
import { createSourceControlFlow } from './source-control-flow'
import type { SourceControlView } from './source-control-flow'
import { createSceneStore } from './scene-store'
import { buildWorktreeGraph } from '../domain/worktree-graph/build-graph'
import type { GitCommitResult, SourceControlStatus } from './ports/runtime-gateway'

const status = (over: Partial<SourceControlStatus> = {}): SourceControlStatus => ({
  branch: 'feat',
  entries: [
    { path: 'a.ts', area: 'staged' },
    { path: 'b.ts', area: 'unstaged' },
    { path: 'c.ts', area: 'staged' },
    { path: 'c.ts', area: 'unstaged' },
    { path: 'd.ts', area: 'untracked' }
  ],
  hasUpstream: true,
  ahead: 1,
  behind: 0,
  ...over
})

function setup(
  opts: { repoKind?: 'git' | 'folder'; status?: () => Promise<SourceControlStatus> } = {}
) {
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
  store.dispatchRepos({
    type: 'set-list',
    list: [{ id: 'r', path: '/r', displayName: 'R', kind: opts.repoKind ?? 'git' }]
  })
  const gateway = {
    gitSourceControlStatus: vi.fn(opts.status ?? (async () => status())),
    gitStage: vi.fn<(w: string, p: readonly string[]) => Promise<void>>(async () => undefined),
    gitUnstage: vi.fn<(w: string, p: readonly string[]) => Promise<void>>(async () => undefined),
    gitCommit: vi.fn<(w: string, m: string) => Promise<GitCommitResult>>(async () => ({
      success: true
    })),
    gitPush: vi.fn<(w: string, o?: { publish?: boolean }) => Promise<void>>(async () => undefined)
  }
  const refreshDiff = vi.fn()
  const flow = createSourceControlFlow({ store, gateway, refreshDiff })
  return { flow, gateway, refreshDiff }
}

const ready = (view: SourceControlView) => {
  if (view.phase !== 'ready') throw new Error(`expected ready, got ${view.phase}`)
  return view
}

describe('source control flow', () => {
  it('stays hidden for a folder workspace without calling git', async () => {
    const { flow, gateway } = setup({ repoKind: 'folder' })
    await flow.open('r::/w')
    expect(flow.view().phase).toBe('hidden')
    expect(gateway.gitSourceControlStatus).not.toHaveBeenCalled()
  })

  it('hides itself when git.status fails', async () => {
    const { flow } = setup({
      status: async () => {
        throw new Error('not a git repo')
      }
    })
    await flow.open('r::/w')
    expect(flow.view().phase).toBe('hidden')
  })

  it('derives per-path stage states: staged, partial and unstaged', async () => {
    const { flow } = setup()
    await flow.open('r::/w')
    const view = ready(flow.view())
    expect([...view.stageStates]).toEqual([
      ['a.ts', 'staged'],
      ['b.ts', 'unstaged'],
      ['c.ts', 'partial'],
      ['d.ts', 'unstaged']
    ])
    expect(view.stagedCount).toBe(2)
  })

  it('toggle stages an unstaged/partial path and unstages a staged one, then refreshes', async () => {
    const { flow, gateway, refreshDiff } = setup()
    await flow.open('r::/w')
    await flow.toggleStage('b.ts')
    expect(gateway.gitStage).toHaveBeenCalledWith('r::/w', ['b.ts'])
    await flow.toggleStage('a.ts')
    expect(gateway.gitUnstage).toHaveBeenCalledWith('r::/w', ['a.ts'])
    await flow.toggleStage('c.ts')
    expect(gateway.gitStage).toHaveBeenLastCalledWith('r::/w', ['c.ts'])
    expect(refreshDiff).toHaveBeenCalledTimes(3)
    expect(gateway.gitSourceControlStatus).toHaveBeenCalledTimes(4)
  })

  it('surfaces a stage failure as an error notice', async () => {
    const { flow, gateway } = setup()
    gateway.gitStage.mockRejectedValueOnce(new Error('index.lock exists'))
    await flow.open('r::/w')
    await flow.toggleStage('b.ts')
    expect(ready(flow.view()).notice).toEqual({ tone: 'error', text: 'index.lock exists' })
  })

  it('commit needs a message and staged files', async () => {
    const { flow, gateway } = setup({ status: async () => status({ entries: [] }) })
    await flow.open('r::/w')
    flow.setMessage('msg')
    expect(ready(flow.view()).canCommit).toBe(false)
    await flow.commit()
    expect(gateway.gitCommit).not.toHaveBeenCalled()
  })

  it('commits the trimmed message, clears it and refreshes', async () => {
    const { flow, gateway, refreshDiff } = setup()
    await flow.open('r::/w')
    flow.setMessage('  feat: x  ')
    expect(ready(flow.view()).canCommit).toBe(true)
    await flow.commit()
    expect(gateway.gitCommit).toHaveBeenCalledWith('r::/w', 'feat: x')
    const view = ready(flow.view())
    expect(view.message).toBe('')
    expect(view.notice?.tone).toBe('ok')
    expect(refreshDiff).toHaveBeenCalled()
  })

  it('keeps the message and shows the host error when git.commit answers success:false', async () => {
    const { flow, gateway } = setup()
    gateway.gitCommit.mockResolvedValueOnce({ success: false, error: 'hook failed' })
    await flow.open('r::/w')
    flow.setMessage('feat: x')
    await flow.commit()
    const view = ready(flow.view())
    expect(view.message).toBe('feat: x')
    expect(view.notice).toEqual({ tone: 'error', text: 'hook failed' })
  })

  it('pushes plainly with an upstream and publishes without one', async () => {
    const withUpstream = setup()
    await withUpstream.flow.open('r::/w')
    await withUpstream.flow.push()
    expect(withUpstream.gateway.gitPush).toHaveBeenCalledWith('r::/w', {})

    const without = setup({ status: async () => status({ hasUpstream: false, ahead: 0 }) })
    await without.flow.open('r::/w')
    await without.flow.push()
    expect(without.gateway.gitPush).toHaveBeenCalledWith('r::/w', { publish: true })
  })

  it('push is disabled when there is an upstream and nothing ahead', async () => {
    const { flow, gateway } = setup({ status: async () => status({ ahead: 0 }) })
    await flow.open('r::/w')
    expect(ready(flow.view()).canPush).toBe(false)
    await flow.push()
    expect(gateway.gitPush).not.toHaveBeenCalled()
  })

  it('reports a push failure and ignores actions while one is in flight', async () => {
    const gate: { release: () => void } = { release: () => undefined }
    const { flow, gateway } = setup()
    gateway.gitPush.mockImplementationOnce(
      () =>
        new Promise<void>((_resolve, reject) => {
          gate.release = () => reject(new Error('rejected (non-fast-forward)'))
        })
    )
    await flow.open('r::/w')
    const first = flow.push()
    void flow.push()
    await flow.toggleStage('b.ts')
    expect(gateway.gitPush).toHaveBeenCalledTimes(1)
    expect(gateway.gitStage).not.toHaveBeenCalled()
    expect(ready(flow.view()).busy).toBe('push')
    gate.release()
    await first
    expect(ready(flow.view()).busy).toBeNull()
    expect(ready(flow.view()).notice).toEqual({
      tone: 'error',
      text: 'rejected (non-fast-forward)'
    })
  })

  it('close drops the state; a late status response for an old open is ignored', async () => {
    const gate: { release: (s: SourceControlStatus) => void } = { release: () => undefined }
    const { flow } = setup({
      status: () =>
        new Promise<SourceControlStatus>((resolve) => {
          gate.release = resolve
        })
    })
    const opening = flow.open('r::/w')
    flow.close()
    gate.release(status())
    await opening
    expect(flow.view().phase).toBe('hidden')
  })
})
