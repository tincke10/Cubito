import { describe, expect, it, vi } from 'vitest'
import { createWorktreeRemoveMethods } from './orcad-worktree-remove-gateway'
import type { RpcCaller } from './orcad-gateway'

const frame = (result: unknown) => ({
  id: 'x',
  ok: true as const,
  result,
  _meta: { runtimeId: 'rt' }
})

describe('createWorktreeRemoveMethods — worktreeRemove', () => {
  it('sends only the worktree selector by default (no force, no hostId)', async () => {
    const call: RpcCaller = vi.fn(async () => frame({ removed: true }))
    await createWorktreeRemoveMethods({ call }).worktreeRemove('repo::/wt')
    expect(call).toHaveBeenCalledWith('worktree.rm', { worktree: 'repo::/wt' })
  })

  it('sends hostId and force when given', async () => {
    const call: RpcCaller = vi.fn(async () => frame({ removed: true }))
    await createWorktreeRemoveMethods({ call }).worktreeRemove('repo::/wt', {
      hostId: 'ssh:box',
      force: true
    })
    expect(call).toHaveBeenCalledWith('worktree.rm', {
      worktree: 'repo::/wt',
      hostId: 'ssh:box',
      force: true
    })
  })

  it('projects the optional warning and preservedBranch', async () => {
    const call: RpcCaller = vi.fn(async () =>
      frame({ removed: true, warning: 'hook skipped', preservedBranch: 'feat/x' })
    )
    await expect(createWorktreeRemoveMethods({ call }).worktreeRemove('w')).resolves.toEqual({
      removed: true,
      warning: 'hook skipped',
      preservedBranch: 'feat/x'
    })
  })

  it('throws when the host does not report removed: true', async () => {
    const call: RpcCaller = vi.fn(async () => frame({}))
    await expect(createWorktreeRemoveMethods({ call }).worktreeRemove('w')).rejects.toThrow(
      /worktree\.rm/
    )
  })
})
