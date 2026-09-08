import { describe, expect, it, vi } from 'vitest'
import { createGitMergeMethods } from './orcad-git-merge-gateway'
import type { RpcCaller } from './orcad-gateway'

const frame = (result: unknown) => ({
  id: 'x',
  ok: true as const,
  result,
  _meta: { runtimeId: 'rt' }
})

describe('createGitMergeMethods — gitMergeWinnerIntoParent', () => {
  it('calls git.mergeWinnerIntoParent with {parent, winner} — no message by default', async () => {
    const call: RpcCaller = vi.fn(async () => frame({ outcome: 'clean', commitOid: 'c0ffee' }))
    const methods = createGitMergeMethods({ call })
    await methods.gitMergeWinnerIntoParent('repo::/parent', 'repo::/child')
    expect(call).toHaveBeenCalledWith('git.mergeWinnerIntoParent', {
      parent: 'repo::/parent',
      winner: 'repo::/child'
    })
  })

  it('passes message through when given', async () => {
    const call: RpcCaller = vi.fn(async () => frame({ outcome: 'clean', commitOid: 'c0ffee' }))
    const methods = createGitMergeMethods({ call })
    await methods.gitMergeWinnerIntoParent('repo::/parent', 'repo::/child', 'merge winner')
    expect(call).toHaveBeenCalledWith('git.mergeWinnerIntoParent', {
      parent: 'repo::/parent',
      winner: 'repo::/child',
      message: 'merge winner'
    })
  })

  it('projects a clean result to {outcome: clean, commitOid}', async () => {
    const call: RpcCaller = vi.fn(async () => frame({ outcome: 'clean', commitOid: 'abc123' }))
    const methods = createGitMergeMethods({ call })
    await expect(methods.gitMergeWinnerIntoParent('p', 'w')).resolves.toEqual({
      outcome: 'clean',
      commitOid: 'abc123'
    })
  })

  it('projects a conflict result to {outcome: conflict, files}', async () => {
    const call: RpcCaller = vi.fn(async () =>
      frame({ outcome: 'conflict', files: ['src/a.ts', 'src/b.ts'] })
    )
    const methods = createGitMergeMethods({ call })
    await expect(methods.gitMergeWinnerIntoParent('p', 'w')).resolves.toEqual({
      outcome: 'conflict',
      files: ['src/a.ts', 'src/b.ts']
    })
  })

  it('throws on a malformed clean result (missing commitOid)', async () => {
    const call: RpcCaller = vi.fn(async () => frame({ outcome: 'clean' }))
    const methods = createGitMergeMethods({ call })
    await expect(methods.gitMergeWinnerIntoParent('p', 'w')).rejects.toThrow(
      /git\.mergeWinnerIntoParent/
    )
  })

  it('throws on a malformed conflict result (files not an array)', async () => {
    const call: RpcCaller = vi.fn(async () => frame({ outcome: 'conflict' }))
    const methods = createGitMergeMethods({ call })
    await expect(methods.gitMergeWinnerIntoParent('p', 'w')).rejects.toThrow(
      /git\.mergeWinnerIntoParent/
    )
  })

  it('throws on an unrecognized outcome', async () => {
    const call: RpcCaller = vi.fn(async () => frame({ outcome: 'unknown' }))
    const methods = createGitMergeMethods({ call })
    await expect(methods.gitMergeWinnerIntoParent('p', 'w')).rejects.toThrow(
      /git\.mergeWinnerIntoParent/
    )
  })

  it('omits syncWorkingTree from the RPC params when not passed', async () => {
    const call: RpcCaller = vi.fn(async () => frame({ outcome: 'clean', commitOid: 'c0ffee' }))
    const methods = createGitMergeMethods({ call })
    await methods.gitMergeWinnerIntoParent('repo::/parent', 'repo::/child')
    expect(call).toHaveBeenCalledWith('git.mergeWinnerIntoParent', {
      parent: 'repo::/parent',
      winner: 'repo::/child'
    })
  })

  it('includes syncWorkingTree:true in the RPC params when requested', async () => {
    const call: RpcCaller = vi.fn(async () => frame({ outcome: 'clean', commitOid: 'c0ffee' }))
    const methods = createGitMergeMethods({ call })
    await methods.gitMergeWinnerIntoParent('repo::/parent', 'repo::/child', undefined, true)
    expect(call).toHaveBeenCalledWith('git.mergeWinnerIntoParent', {
      parent: 'repo::/parent',
      winner: 'repo::/child',
      syncWorkingTree: true
    })
  })

  it('omits syncWorkingTree from the RPC params when explicitly false', async () => {
    const call: RpcCaller = vi.fn(async () => frame({ outcome: 'clean', commitOid: 'c0ffee' }))
    const methods = createGitMergeMethods({ call })
    await methods.gitMergeWinnerIntoParent('repo::/parent', 'repo::/child', undefined, false)
    expect(call).toHaveBeenCalledWith('git.mergeWinnerIntoParent', {
      parent: 'repo::/parent',
      winner: 'repo::/child'
    })
  })

  it('projects a synced workingTree sub-shape', async () => {
    const call: RpcCaller = vi.fn(async () =>
      frame({ outcome: 'clean', commitOid: 'abc123', workingTree: { status: 'synced' } })
    )
    const methods = createGitMergeMethods({ call })
    await expect(methods.gitMergeWinnerIntoParent('p', 'w')).resolves.toEqual({
      outcome: 'clean',
      commitOid: 'abc123',
      workingTree: { status: 'synced' }
    })
  })

  it('projects a skipped/dirty workingTree sub-shape', async () => {
    const call: RpcCaller = vi.fn(async () =>
      frame({
        outcome: 'clean',
        commitOid: 'abc123',
        workingTree: { status: 'skipped', reason: 'dirty' }
      })
    )
    const methods = createGitMergeMethods({ call })
    await expect(methods.gitMergeWinnerIntoParent('p', 'w')).resolves.toEqual({
      outcome: 'clean',
      commitOid: 'abc123',
      workingTree: { status: 'skipped', reason: 'dirty' }
    })
  })

  it('projects a failed workingTree sub-shape with its message', async () => {
    const call: RpcCaller = vi.fn(async () =>
      frame({
        outcome: 'clean',
        commitOid: 'abc123',
        workingTree: { status: 'failed', message: 'refusing to clobber' }
      })
    )
    const methods = createGitMergeMethods({ call })
    await expect(methods.gitMergeWinnerIntoParent('p', 'w')).resolves.toEqual({
      outcome: 'clean',
      commitOid: 'abc123',
      workingTree: { status: 'failed', message: 'refusing to clobber' }
    })
  })

  it('drops a malformed workingTree instead of throwing on an otherwise-valid clean result', async () => {
    const call: RpcCaller = vi.fn(async () =>
      frame({ outcome: 'clean', commitOid: 'abc123', workingTree: { status: 'bogus' } })
    )
    const methods = createGitMergeMethods({ call })
    await expect(methods.gitMergeWinnerIntoParent('p', 'w')).resolves.toEqual({
      outcome: 'clean',
      commitOid: 'abc123'
    })
  })
})
