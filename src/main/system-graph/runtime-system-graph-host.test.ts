import { describe, expect, it, vi } from 'vitest'
import type { FsChangeEvent } from '../../shared/filesystem-entry-types'
import {
  createRuntimeSystemGraphHost,
  getRuntimeSystemGraphHost,
  getRuntimeSystemGraphService,
  type RuntimeSystemGraphDeps
} from './runtime-system-graph-host'

function fakeDeps(overrides?: Partial<RuntimeSystemGraphDeps>): RuntimeSystemGraphDeps {
  return {
    getRepoConnectionId: () => null,
    watchFileExplorer: async () => async () => {},
    ...overrides
  }
}

describe('createRuntimeSystemGraphHost.resolveWorktree', () => {
  it('resolves a local worktree with a null connectionId', () => {
    const host = createRuntimeSystemGraphHost(fakeDeps({ getRepoConnectionId: () => null }))

    expect(host.resolveWorktree('repo-1::/repo/local-app')).toEqual({
      rootPath: '/repo/local-app',
      connectionId: null
    })
  })

  it('resolves an SSH worktree via deps.getRepoConnectionId(repoId)', () => {
    const getRepoConnectionId = vi.fn((repoId: string) =>
      repoId === 'repo-2' ? 'ssh-conn-9' : null
    )
    const host = createRuntimeSystemGraphHost(fakeDeps({ getRepoConnectionId }))

    expect(host.resolveWorktree('repo-2::/repo/ssh-app')).toEqual({
      rootPath: '/repo/ssh-app',
      connectionId: 'ssh-conn-9'
    })
    expect(getRepoConnectionId).toHaveBeenCalledWith('repo-2')
  })

  it('returns null for a malformed worktree id (no separator)', () => {
    const host = createRuntimeSystemGraphHost(fakeDeps())

    expect(host.resolveWorktree('not-a-worktree-id')).toBeNull()
  })
})

describe('createRuntimeSystemGraphHost.watchWorktreeFiles', () => {
  it('delegates to deps.watchFileExplorer and tracks the worktree as armed', async () => {
    const release = vi.fn(async () => {})
    const watchFileExplorer = vi.fn(async () => release)
    const host = createRuntimeSystemGraphHost(fakeDeps({ watchFileExplorer }))
    const onEvents = (_events: FsChangeEvent[]) => {}
    const onTerminalError = (_error: Error) => {}

    expect(host.listLiveWorktreeIds().has('repo-1::/repo/app')).toBe(false)

    const release2 = await host.watchWorktreeFiles('repo-1::/repo/app', onEvents, onTerminalError)

    expect(watchFileExplorer).toHaveBeenCalledWith('repo-1::/repo/app', onEvents, onTerminalError)
    expect(host.listLiveWorktreeIds().has('repo-1::/repo/app')).toBe(true)

    await release2()

    expect(release).toHaveBeenCalledTimes(1)
    expect(host.listLiveWorktreeIds().has('repo-1::/repo/app')).toBe(false)
  })
})

describe('getRuntimeSystemGraphHost identity', () => {
  it('returns the SAME host instance for the same runtime object', () => {
    const runtime = {} as never
    expect(getRuntimeSystemGraphHost(runtime)).toBe(getRuntimeSystemGraphHost(runtime))
  })

  it('returns DIFFERENT host instances for different runtime objects', () => {
    const runtimeA = {} as never
    const runtimeB = {} as never
    expect(getRuntimeSystemGraphHost(runtimeA)).not.toBe(getRuntimeSystemGraphHost(runtimeB))
  })

  it('keeps getRuntimeSystemGraphService stable per runtime (no service fork)', () => {
    const runtime = {} as never
    expect(getRuntimeSystemGraphService(runtime)).toBe(getRuntimeSystemGraphService(runtime))
  })
})
