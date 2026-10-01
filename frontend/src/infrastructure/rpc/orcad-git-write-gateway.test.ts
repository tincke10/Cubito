import { describe, expect, it, vi } from 'vitest'
import { createGitWriteMethods } from './orcad-git-write-gateway'
import type { RpcCaller } from './orcad-gateway'

const frame = (result: unknown) => ({
  id: 'x',
  ok: true as const,
  result,
  _meta: { runtimeId: 'rt' }
})

const caller = (result: unknown = {}) => vi.fn<RpcCaller>(async () => frame(result))

describe('createGitWriteMethods', () => {
  it('projects git.status with staging areas and upstream counters', async () => {
    const call = caller({
      branch: 'feat',
      entries: [
        { path: 'a.ts', status: 'modified', area: 'staged' },
        { path: 'a.ts', status: 'modified', area: 'unstaged' },
        { path: 'b.ts', status: 'untracked', area: 'untracked' },
        { path: 7, status: 'modified', area: 'staged' }
      ],
      upstreamStatus: { hasUpstream: true, upstreamName: 'origin/feat', ahead: 2, behind: 1 }
    })
    const status = await createGitWriteMethods({ call }).gitSourceControlStatus('r::/w')
    expect(call).toHaveBeenCalledWith('git.status', { worktree: 'r::/w' })
    expect(status).toEqual({
      branch: 'feat',
      entries: [
        { path: 'a.ts', area: 'staged' },
        { path: 'a.ts', area: 'unstaged' },
        { path: 'b.ts', area: 'untracked' }
      ],
      hasUpstream: true,
      ahead: 2,
      behind: 1
    })
  })

  it('treats a missing upstreamStatus as no upstream with zero counters', async () => {
    const status = await createGitWriteMethods({
      call: caller({ entries: [] })
    }).gitSourceControlStatus('w')
    expect(status).toMatchObject({ hasUpstream: false, ahead: 0, behind: 0 })
  })

  it('stages and unstages through the bulk RPCs', async () => {
    const call = caller({ ok: true })
    const methods = createGitWriteMethods({ call })
    await methods.gitStage('w', ['a', 'b'])
    await methods.gitUnstage('w', ['a'])
    expect(call).toHaveBeenNthCalledWith(1, 'git.bulkStage', {
      worktree: 'w',
      filePaths: ['a', 'b']
    })
    expect(call).toHaveBeenNthCalledWith(2, 'git.bulkUnstage', { worktree: 'w', filePaths: ['a'] })
  })

  it('skips the RPC for an empty path list', async () => {
    const call = caller()
    await createGitWriteMethods({ call }).gitStage('w', [])
    expect(call).not.toHaveBeenCalled()
  })

  it('returns success:false from git.commit without throwing', async () => {
    const call = caller({ success: false, error: 'nothing to commit' })
    await expect(createGitWriteMethods({ call }).gitCommit('w', 'msg')).resolves.toEqual({
      success: false,
      error: 'nothing to commit'
    })
    expect(call).toHaveBeenCalledWith('git.commit', { worktree: 'w', message: 'msg' })
  })

  it('returns success:true on a clean commit', async () => {
    const call = caller({ success: true })
    await expect(createGitWriteMethods({ call }).gitCommit('w', 'm')).resolves.toEqual({
      success: true
    })
  })

  it('pushes with publish only when asked, and lets failures throw', async () => {
    const call = vi
      .fn<RpcCaller>()
      .mockResolvedValueOnce(frame({ ok: true }))
      .mockResolvedValueOnce(frame({ ok: true }))
      .mockRejectedValueOnce(new Error('rejected'))
    const methods = createGitWriteMethods({ call })
    await methods.gitPush('w')
    await methods.gitPush('w', { publish: true })
    expect(call).toHaveBeenNthCalledWith(1, 'git.push', { worktree: 'w' })
    expect(call).toHaveBeenNthCalledWith(2, 'git.push', { worktree: 'w', publish: true })
    await expect(methods.gitPush('w')).rejects.toThrow('rejected')
  })
})
