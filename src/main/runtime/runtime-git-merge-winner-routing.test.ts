import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { GlobalSettings } from '../../shared/global-settings-types'
import type * as MergeWinnerModule from '../git/merge-winner'
import { RuntimeGitCommands, type ResolvedRuntimeGitWorktree } from './orca-runtime-git'
import type { RuntimeGitTarget } from './runtime-git-command-target'

const mocks = vi.hoisted(() => ({
  mergeWinnerIntoParent: vi.fn(),
  getSshGitProvider: vi.fn()
}))

vi.mock('../git/merge-winner', async () => ({
  ...(await vi.importActual<typeof MergeWinnerModule>('../git/merge-winner')),
  mergeWinnerIntoParent: mocks.mergeWinnerIntoParent
}))

vi.mock('../providers/ssh-git-dispatch', () => ({
  getSshGitProvider: mocks.getSshGitProvider,
  SSH_GIT_PROVIDER_UNAVAILABLE_MESSAGE:
    'Remote connection dropped. Click Reconnect on the SSH target before retrying.'
}))

function makeWorktree(path: string, branch: string): ResolvedRuntimeGitWorktree {
  const worktree = {
    id: 'wt-1',
    repoId: 'repo-1',
    path,
    linkedIssue: null,
    git: { path, branch, isBare: false, isMainWorktree: false, head: 'a'.repeat(40) }
  } satisfies Partial<ResolvedRuntimeGitWorktree>
  return worktree as unknown as ResolvedRuntimeGitWorktree
}

function makeCommands(targetsBySelector: Record<string, RuntimeGitTarget>): RuntimeGitCommands {
  return new RuntimeGitCommands({
    resolveRuntimeGitTarget: async (selector) => {
      const target = targetsBySelector[selector]
      if (!target) {
        throw new Error(`no target for ${selector}`)
      }
      return target
    },
    getRuntimeSettings: () => ({}) as GlobalSettings
  })
}

describe('RuntimeGitCommands.mergeRuntimeGitWinnerIntoParent', () => {
  beforeEach(() => {
    mocks.mergeWinnerIntoParent.mockReset()
    mocks.getSshGitProvider.mockReset()
  })

  it('merges locally when both targets share no SSH connection', async () => {
    mocks.mergeWinnerIntoParent.mockResolvedValue({ outcome: 'clean', commitOid: 'c'.repeat(40) })
    const commands = makeCommands({
      'id:parent': { worktree: makeWorktree('/repo/parent', 'parent-branch') },
      'id:winner': { worktree: makeWorktree('/repo/winner', 'winner-branch') }
    })

    const result = await commands.mergeRuntimeGitWinnerIntoParent(
      'id:parent',
      'id:winner',
      'custom message'
    )

    expect(result).toEqual({ outcome: 'clean', commitOid: 'c'.repeat(40) })
    expect(mocks.mergeWinnerIntoParent).toHaveBeenCalledWith(
      '/repo/parent',
      '/repo/winner',
      'custom message',
      {}
    )
    expect(mocks.getSshGitProvider).not.toHaveBeenCalled()
  })

  it('defaults the commit message from the parent and winner branch names', async () => {
    mocks.mergeWinnerIntoParent.mockResolvedValue({ outcome: 'clean', commitOid: 'c'.repeat(40) })
    const commands = makeCommands({
      'id:parent': { worktree: makeWorktree('/repo/parent', 'parent-branch') },
      'id:winner': { worktree: makeWorktree('/repo/winner', 'winner-branch') }
    })

    await commands.mergeRuntimeGitWinnerIntoParent('id:parent', 'id:winner')

    expect(mocks.mergeWinnerIntoParent).toHaveBeenCalledWith(
      '/repo/parent',
      '/repo/winner',
      'Merge winner-branch into parent-branch',
      {}
    )
  })

  it('routes to the SSH git provider when both targets share one connection', async () => {
    const provider = {
      mergeWinnerIntoParent: vi.fn().mockResolvedValue({ outcome: 'conflict', files: ['a.ts'] })
    }
    mocks.getSshGitProvider.mockReturnValue(provider)
    const commands = makeCommands({
      'id:parent': {
        worktree: makeWorktree('/remote/parent', 'parent-branch'),
        connectionId: 'conn-1'
      },
      'id:winner': {
        worktree: makeWorktree('/remote/winner', 'winner-branch'),
        connectionId: 'conn-1'
      }
    })

    const result = await commands.mergeRuntimeGitWinnerIntoParent('id:parent', 'id:winner', 'msg')

    expect(result).toEqual({ outcome: 'conflict', files: ['a.ts'] })
    expect(provider.mergeWinnerIntoParent).toHaveBeenCalledWith(
      '/remote/parent',
      '/remote/winner',
      'msg'
    )
    expect(mocks.mergeWinnerIntoParent).not.toHaveBeenCalled()
  })

  it('throws loudly instead of falling back to local when the SSH provider is unavailable', async () => {
    mocks.getSshGitProvider.mockReturnValue(undefined)
    const commands = makeCommands({
      'id:parent': {
        worktree: makeWorktree('/remote/parent', 'parent-branch'),
        connectionId: 'conn-1'
      },
      'id:winner': {
        worktree: makeWorktree('/remote/winner', 'winner-branch'),
        connectionId: 'conn-1'
      }
    })

    await expect(
      commands.mergeRuntimeGitWinnerIntoParent('id:parent', 'id:winner', 'msg')
    ).rejects.toThrow(
      'Remote connection dropped. Click Reconnect on the SSH target before retrying.'
    )
    expect(mocks.mergeWinnerIntoParent).not.toHaveBeenCalled()
  })

  it('forwards syncWorkingTree to the local merge when requested', async () => {
    mocks.mergeWinnerIntoParent.mockResolvedValue({ outcome: 'clean', commitOid: 'c'.repeat(40) })
    const commands = makeCommands({
      'id:parent': { worktree: makeWorktree('/repo/parent', 'parent-branch') },
      'id:winner': { worktree: makeWorktree('/repo/winner', 'winner-branch') }
    })

    await commands.mergeRuntimeGitWinnerIntoParent('id:parent', 'id:winner', 'custom message', true)

    expect(mocks.mergeWinnerIntoParent).toHaveBeenCalledWith(
      '/repo/parent',
      '/repo/winner',
      'custom message',
      { syncWorkingTree: true }
    )
  })

  it('forwards syncWorkingTree to the SSH provider when requested', async () => {
    const provider = {
      mergeWinnerIntoParent: vi
        .fn()
        .mockResolvedValue({ outcome: 'clean', commitOid: 'c'.repeat(40) })
    }
    mocks.getSshGitProvider.mockReturnValue(provider)
    const commands = makeCommands({
      'id:parent': {
        worktree: makeWorktree('/remote/parent', 'parent-branch'),
        connectionId: 'conn-1'
      },
      'id:winner': {
        worktree: makeWorktree('/remote/winner', 'winner-branch'),
        connectionId: 'conn-1'
      }
    })

    await commands.mergeRuntimeGitWinnerIntoParent('id:parent', 'id:winner', 'msg', true)

    expect(provider.mergeWinnerIntoParent).toHaveBeenCalledWith(
      '/remote/parent',
      '/remote/winner',
      'msg',
      { syncWorkingTree: true }
    )
  })

  it('throws when the parent and winner resolve to different execution hosts', async () => {
    const commands = makeCommands({
      'id:parent': {
        worktree: makeWorktree('/remote/parent', 'parent-branch'),
        connectionId: 'conn-1'
      },
      'id:winner': { worktree: makeWorktree('/local/winner', 'winner-branch') }
    })

    await expect(
      commands.mergeRuntimeGitWinnerIntoParent('id:parent', 'id:winner', 'msg')
    ).rejects.toThrow('Cannot merge across execution hosts')
    expect(mocks.mergeWinnerIntoParent).not.toHaveBeenCalled()
    expect(mocks.getSshGitProvider).not.toHaveBeenCalled()
  })
})
