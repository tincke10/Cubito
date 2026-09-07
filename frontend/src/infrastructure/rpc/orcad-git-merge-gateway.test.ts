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
})
