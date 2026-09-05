import { describe, expect, it, vi } from 'vitest'
import { createOrcadGateway } from './orcad-gateway'
import type { RpcCaller } from './orcad-gateway'

describe('createOrcadGateway', () => {
  it('lists worktrees via worktree.list', async () => {
    const worktrees = [{ id: 'w1' }]
    const call: RpcCaller = vi.fn(async () => ({
      id: 'x',
      ok: true as const,
      result: { worktrees },
      _meta: { runtimeId: 'rt' }
    }))
    const gateway = createOrcadGateway({ call })
    await expect(gateway.listWorktrees()).resolves.toEqual(worktrees)
    expect(call).toHaveBeenCalledWith('worktree.list')
  })

  it('rejects when the result payload has no worktrees array', async () => {
    const call: RpcCaller = async () => ({
      id: 'x',
      ok: true as const,
      result: { unexpected: true },
      _meta: { runtimeId: 'rt' }
    })
    const gateway = createOrcadGateway({ call })
    await expect(gateway.listWorktrees()).rejects.toThrow(/worktree\.list/)
  })

  it('behaves exactly as before when no options are passed (regression)', async () => {
    const worktrees = [{ id: 'w1' }]
    const call: RpcCaller = vi.fn(async () => ({
      id: 'x',
      ok: true as const,
      result: { worktrees },
      _meta: { runtimeId: 'rt' }
    }))
    const gateway = createOrcadGateway({ call })
    await expect(gateway.listWorktrees()).resolves.toEqual(worktrees)
  })

  it('calls onRuntimeId exactly once per listWorktrees() call with the response runtimeId', async () => {
    const worktrees = [{ id: 'w1' }]
    const call: RpcCaller = vi.fn(async () => ({
      id: 'x',
      ok: true as const,
      result: { worktrees },
      _meta: { runtimeId: 'rt-42' }
    }))
    const onRuntimeId = vi.fn()
    const gateway = createOrcadGateway({ call }, { onRuntimeId })
    await gateway.listWorktrees()
    expect(onRuntimeId).toHaveBeenCalledTimes(1)
    expect(onRuntimeId).toHaveBeenCalledWith('rt-42')

    await gateway.listWorktrees()
    expect(onRuntimeId).toHaveBeenCalledTimes(2)
  })

  it('does not call onRuntimeId when the call rejects', async () => {
    const error = new Error('boom')
    const call: RpcCaller = vi.fn(async () => {
      throw error
    })
    const onRuntimeId = vi.fn()
    const gateway = createOrcadGateway({ call }, { onRuntimeId })
    await expect(gateway.listWorktrees()).rejects.toThrow('boom')
    expect(onRuntimeId).not.toHaveBeenCalled()
  })

  it('stays frozen at the fan-out-era method set — no undocumented methods added (CO-305 ratchet)', () => {
    const call: RpcCaller = vi.fn()
    const gateway = createOrcadGateway({ call })
    expect(Object.keys(gateway)).toEqual([
      'listWorktrees',
      'listRepos',
      'addRepo',
      'createWorktree',
      'listWorktreePs'
    ])
  })

  it('lists repos via repo.list', async () => {
    const repos = [{ id: 'repo-1', path: '/repo-1', displayName: 'Repo One', kind: 'git' }]
    const call: RpcCaller = vi.fn(async () => ({
      id: 'x',
      ok: true as const,
      result: { repos },
      _meta: { runtimeId: 'rt' }
    }))
    const gateway = createOrcadGateway({ call })
    await expect(gateway.listRepos()).resolves.toEqual(repos)
    expect(call).toHaveBeenCalledWith('repo.list')
  })

  it('adds a repo via repo.add, passing path/kind through as params', async () => {
    const repo = { id: 'repo-2', path: '/abs/repo-2', displayName: 'Repo Two', kind: 'git' }
    const call: RpcCaller = vi.fn(async () => ({
      id: 'x',
      ok: true as const,
      result: { repo },
      _meta: { runtimeId: 'rt' }
    }))
    const gateway = createOrcadGateway({ call })
    await expect(gateway.addRepo({ path: '/abs/repo-2', kind: 'git' })).resolves.toEqual(repo)
    expect(call).toHaveBeenCalledWith('repo.add', { path: '/abs/repo-2', kind: 'git' })
  })

  it('rejects readably when repo.add returns no repo id', async () => {
    const call: RpcCaller = async () => ({
      id: 'x',
      ok: true as const,
      result: {},
      _meta: { runtimeId: 'rt' }
    })
    const gateway = createOrcadGateway({ call })
    await expect(gateway.addRepo({ path: '/abs/repo-2' })).rejects.toThrow(/repo\.add/)
  })

  it('addRepo rejection propagates the underlying error without leaking RPC internals', async () => {
    const error = new Error('Project path must be an absolute path')
    const call: RpcCaller = vi.fn(async () => {
      throw error
    })
    const gateway = createOrcadGateway({ call })
    await expect(gateway.addRepo({ path: 'relative/path' })).rejects.toThrow(
      'Project path must be an absolute path'
    )
  })

  it('rejects when repo.list returns no repos array', async () => {
    const call: RpcCaller = async () => ({
      id: 'x',
      ok: true as const,
      result: { unexpected: true },
      _meta: { runtimeId: 'rt' }
    })
    const gateway = createOrcadGateway({ call })
    await expect(gateway.listRepos()).rejects.toThrow(/repo\.list/)
  })

  it('creates a worktree via worktree.create, passing the input through as params', async () => {
    const input = { repo: 'id:repo-1', name: 'cubito/auth-retry', clientMutationId: 'm-1' }
    const call: RpcCaller = vi.fn(async () => ({
      id: 'x',
      ok: true as const,
      result: { worktree: { id: 'w-1' } },
      _meta: { runtimeId: 'rt' }
    }))
    const gateway = createOrcadGateway({ call })
    await expect(gateway.createWorktree(input)).resolves.toEqual({ worktreeId: 'w-1' })
    expect(call).toHaveBeenCalledWith('worktree.create', input)
  })

  it('createWorktree sends exactly the given keys — no undefined-valued keys added (omit contract)', async () => {
    const input = { repo: 'id:repo-1', name: 'x' }
    const call: RpcCaller = vi.fn(async () => ({
      id: 'x',
      ok: true as const,
      result: { worktree: { id: 'w-1' } },
      _meta: { runtimeId: 'rt' }
    }))
    const gateway = createOrcadGateway({ call })
    await gateway.createWorktree(input)
    const sentParams = (call as ReturnType<typeof vi.fn>).mock.calls[0]?.[1]
    expect(sentParams).toStrictEqual(input)
  })

  it('surfaces warnings from worktree.create when present', async () => {
    const call: RpcCaller = vi.fn(async () => ({
      id: 'x',
      ok: true as const,
      result: { worktree: { id: 'w-1' }, warnings: ['base branch fell back to main'] },
      _meta: { runtimeId: 'rt' }
    }))
    const gateway = createOrcadGateway({ call })
    await expect(gateway.createWorktree({ repo: 'id:repo-1' })).resolves.toEqual({
      worktreeId: 'w-1',
      warnings: ['base branch fell back to main']
    })
  })

  it('rejects readably when worktree.create returns no worktree id', async () => {
    const call: RpcCaller = async () => ({
      id: 'x',
      ok: true as const,
      result: {},
      _meta: { runtimeId: 'rt' }
    })
    const gateway = createOrcadGateway({ call })
    await expect(gateway.createWorktree({ repo: 'id:repo-1' })).rejects.toThrow(/worktree\.create/)
  })

  it('createWorktree rejection propagates the underlying error without leaking RPC internals', async () => {
    const error = new Error('connection dropped')
    const call: RpcCaller = vi.fn(async () => {
      throw error
    })
    const gateway = createOrcadGateway({ call })
    await expect(gateway.createWorktree({ repo: 'id:repo-1' })).rejects.toThrow(
      'connection dropped'
    )
  })

  it('lists worktree.ps via the worktree.ps method, mapping result.worktrees rows to WorktreePsRow', async () => {
    const call: RpcCaller = vi.fn(async () => ({
      id: 'x',
      ok: true as const,
      result: {
        worktrees: [
          { worktreeId: 'w1', status: 'working' },
          { worktreeId: 'w2', status: 'idle' }
        ]
      },
      _meta: { runtimeId: 'rt' }
    }))
    const gateway = createOrcadGateway({ call })
    await expect(gateway.listWorktreePs()).resolves.toEqual([
      { worktreeId: 'w1', status: 'working' },
      { worktreeId: 'w2', status: 'idle' }
    ])
    expect(call).toHaveBeenCalledWith('worktree.ps')
  })

  it('throws when worktree.ps returns no worktrees array', async () => {
    const call: RpcCaller = async () => ({
      id: 'x',
      ok: true as const,
      result: { unexpected: true },
      _meta: { runtimeId: 'rt' }
    })
    const gateway = createOrcadGateway({ call })
    await expect(gateway.listWorktreePs()).rejects.toThrow(/worktree\.ps/)
  })

  it("coerces a non-string status to 'inactive'", async () => {
    const call: RpcCaller = vi.fn(async () => ({
      id: 'x',
      ok: true as const,
      result: { worktrees: [{ worktreeId: 'w1', status: 42 }] },
      _meta: { runtimeId: 'rt' }
    }))
    const gateway = createOrcadGateway({ call })
    await expect(gateway.listWorktreePs()).resolves.toEqual([
      { worktreeId: 'w1', status: 'inactive' }
    ])
  })
})
