import { describe, expect, it, vi } from 'vitest'
import { SshGitProvider } from './ssh-git-provider'

describe('SshGitProvider merge operations', () => {
  it('abortMerge sends git.abortMerge request', async () => {
    const mux = {
      request: vi.fn().mockResolvedValue(undefined),
      notify: vi.fn(),
      onNotification: vi.fn(),
      dispose: vi.fn(),
      isDisposed: vi.fn().mockReturnValue(false)
    }
    const provider = new SshGitProvider('conn-1', mux as never)

    await provider.abortMerge('/home/user/repo')

    expect(mux.request).toHaveBeenCalledWith('git.abortMerge', {
      worktreePath: '/home/user/repo'
    })
  })

  it('abortRebase sends git.abortRebase request', async () => {
    const mux = {
      request: vi.fn().mockResolvedValue(undefined),
      notify: vi.fn(),
      onNotification: vi.fn(),
      dispose: vi.fn(),
      isDisposed: vi.fn().mockReturnValue(false)
    }
    const provider = new SshGitProvider('conn-1', mux as never)

    await provider.abortRebase('/home/user/repo')

    expect(mux.request).toHaveBeenCalledWith('git.abortRebase', {
      worktreePath: '/home/user/repo'
    })
  })

  it('mergeWinnerIntoParent sends git.mergeWinnerIntoParent request', async () => {
    const mux = {
      request: vi.fn().mockResolvedValue({ outcome: 'clean', commitOid: 'c'.repeat(40) }),
      notify: vi.fn(),
      onNotification: vi.fn(),
      dispose: vi.fn(),
      isDisposed: vi.fn().mockReturnValue(false)
    }
    const provider = new SshGitProvider('conn-1', mux as never)

    const result = await provider.mergeWinnerIntoParent(
      '/home/user/parent',
      '/home/user/winner',
      'Merge winner into parent'
    )

    expect(mux.request).toHaveBeenCalledWith('git.mergeWinnerIntoParent', {
      parentPath: '/home/user/parent',
      winnerPath: '/home/user/winner',
      message: 'Merge winner into parent'
    })
    expect(result).toEqual({ outcome: 'clean', commitOid: 'c'.repeat(40) })
  })
})
