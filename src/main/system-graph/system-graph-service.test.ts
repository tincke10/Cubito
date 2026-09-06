import { posix } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FsChangeEvent } from '../../shared/filesystem-entry-types'
import { WATCH_BATCH_MAX_WAIT_MS } from '../../shared/filesystem-watch-batch-window'
import type { IFilesystemProvider } from '../providers/types'
import {
  getSystemGraphService,
  SystemGraphService,
  type SystemGraphHost
} from './system-graph-service'

/** Fully in-memory worktree: a connectionId is always set so the service takes the
 * SSH reader path, keeping these tests off real disk (per D3: "no disk, no runtime"). */
type FakeWorktree = {
  rootPath: string
  connectionId: string
  files: Record<string, string> // relative posix path (root-level) -> text content
}

function fakeFilesystemProvider(worktree: FakeWorktree): IFilesystemProvider {
  const relOf = (absPath: string): string => posix.relative(worktree.rootPath, absPath) || '.'
  return {
    stat: async (absPath) => {
      const rel = relOf(absPath)
      if (rel === '.') {
        return { size: 0, type: 'directory', mtime: 0 }
      }
      const content = worktree.files[rel]
      if (content === undefined) {
        throw new Error('ENOENT')
      }
      return { size: Buffer.byteLength(content), type: 'file', mtime: 0 }
    },
    readDir: async (absPath) => {
      if (relOf(absPath) !== '.') {
        return []
      }
      return Object.keys(worktree.files).map((name) => ({
        name,
        isDirectory: false,
        isSymlink: false
      }))
    },
    readFile: async (absPath) => {
      const content = worktree.files[relOf(absPath)]
      if (content === undefined) {
        throw new Error('ENOENT')
      }
      return { content, isBinary: false }
    },
    writeFile: async () => {},
    writeFileBase64: async () => {},
    writeFileBase64Chunk: async () => {},
    deletePath: async () => {},
    createFile: async () => {},
    createDir: async () => {},
    createDirNoClobber: async () => {},
    rename: async () => {},
    renameNoClobber: async () => {},
    copy: async () => {},
    realpath: async (p) => p,
    search: async () => ({ results: [], truncated: false }) as never,
    listFiles: async () => [],
    watch: async () => () => {}
  }
}

function fakeHost(worktrees: Record<string, FakeWorktree>): SystemGraphHost {
  const providers = new Map<string, IFilesystemProvider>()
  for (const worktree of Object.values(worktrees)) {
    providers.set(worktree.connectionId, fakeFilesystemProvider(worktree))
  }
  return {
    resolveWorktree: (worktreeId) => {
      const worktree = worktrees[worktreeId]
      return worktree ? { rootPath: worktree.rootPath, connectionId: worktree.connectionId } : null
    },
    getFilesystemProvider: (connectionId) => providers.get(connectionId),
    watchWorktreeFiles: async () => async () => {},
    listLiveWorktreeIds: () => new Set(Object.keys(worktrees))
  }
}

type WatchHandlers = {
  onEvents: (events: FsChangeEvent[]) => void
  onTerminalError: (error: Error) => void
  release: ReturnType<typeof vi.fn>
}

/** Fake host that hands tests direct control over watcher event delivery and a spy
 * release fn per rootPath, plus a mutable live-ids set for reconcile() tests. */
function watchableHost(worktrees: Record<string, FakeWorktree>): SystemGraphHost & {
  emit: (rootPath: string, events: FsChangeEvent[]) => void
  triggerTerminalError: (rootPath: string, error: Error) => void
  releaseSpy: (rootPath: string) => ReturnType<typeof vi.fn> | undefined
  liveWorktreeIds: Set<string>
} {
  const providers = new Map<string, IFilesystemProvider>()
  for (const worktree of Object.values(worktrees)) {
    providers.set(worktree.connectionId, fakeFilesystemProvider(worktree))
  }
  const handlers = new Map<string, WatchHandlers>()
  const liveWorktreeIds = new Set(Object.keys(worktrees))

  return {
    resolveWorktree: (worktreeId) => {
      const worktree = worktrees[worktreeId]
      return worktree ? { rootPath: worktree.rootPath, connectionId: worktree.connectionId } : null
    },
    getFilesystemProvider: (connectionId) => providers.get(connectionId),
    watchWorktreeFiles: async (rootPath, onEvents, onTerminalError) => {
      const release = vi.fn(async () => {})
      handlers.set(rootPath, { onEvents, onTerminalError, release })
      return release
    },
    listLiveWorktreeIds: () => liveWorktreeIds,
    emit: (rootPath, events) => handlers.get(rootPath)?.onEvents(events),
    triggerTerminalError: (rootPath, error) => handlers.get(rootPath)?.onTerminalError(error),
    releaseSpy: (rootPath) => handlers.get(rootPath)?.release,
    liveWorktreeIds
  }
}

const EXPRESS_WORKTREE: FakeWorktree = {
  rootPath: '/repo/express-app',
  connectionId: 'ssh-express',
  files: {
    'package.json': JSON.stringify({ dependencies: { express: '^4.19.0' } }),
    'tsconfig.json': '{}',
    'server.ts': [
      "import express from 'express'",
      'const app = express()',
      "app.get('/health', (req, res) => res.send('ok'))"
    ].join('\n')
  }
}

const NON_EXPRESS_WORKTREE: FakeWorktree = {
  rootPath: '/repo/plain-app',
  connectionId: 'ssh-plain',
  files: { 'package.json': JSON.stringify({ dependencies: { fastify: '^4.0.0' } }) }
}

describe('SystemGraphService', () => {
  it('returns undefined for a worktree that has never been built', () => {
    const service = new SystemGraphService(fakeHost({}))
    expect(service.getGraph('unknown')).toBeUndefined()
  })

  it('builds a graph from an express worktree', async () => {
    const service = new SystemGraphService(fakeHost({ w1: EXPRESS_WORKTREE }))

    await service.buildGraph('w1')
    const graph = service.getGraph('w1')

    expect(graph).toBeDefined()
    expect([...graph!.nodes.values()].some((n) => n.kind === 'router')).toBe(true)
    expect([...graph!.nodes.values()].some((n) => n.kind === 'endpoint')).toBe(true)
  })

  it('stores an empty graph for a non-express worktree', async () => {
    const service = new SystemGraphService(fakeHost({ w2: NON_EXPRESS_WORKTREE }))

    await service.buildGraph('w2')

    expect(service.getGraph('w2')).toEqual({ nodes: new Map(), edges: [] })
  })

  it('keeps per-worktree graphs isolated', async () => {
    const service = new SystemGraphService(
      fakeHost({ w1: EXPRESS_WORKTREE, w2: NON_EXPRESS_WORKTREE })
    )

    await service.buildGraph('w1')
    await service.buildGraph('w2')

    expect(service.getGraph('w1')?.nodes.size).toBeGreaterThan(0)
    expect(service.getGraph('w2')?.nodes.size).toBe(0)
  })

  it('keeps the last-good graph when a rebuild fails entirely', async () => {
    let calls = 0
    const flakyHost: SystemGraphHost = {
      resolveWorktree: () => {
        calls += 1
        if (calls === 1) {
          return {
            rootPath: EXPRESS_WORKTREE.rootPath,
            connectionId: EXPRESS_WORKTREE.connectionId
          }
        }
        throw new Error('resolve failed')
      },
      getFilesystemProvider: () => fakeFilesystemProvider(EXPRESS_WORKTREE),
      watchWorktreeFiles: async () => async () => {},
      listLiveWorktreeIds: () => new Set(['w1'])
    }
    const service = new SystemGraphService(flakyHost)

    await service.buildGraph('w1')
    const goodGraph = service.getGraph('w1')
    expect(goodGraph?.nodes.size).toBeGreaterThan(0)

    await expect(service.buildGraph('w1')).resolves.not.toThrow()
    expect(service.getGraph('w1')).toBe(goodGraph)
  })
})

describe('SystemGraphService watch/dispose/reconcile', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('rebuilds after the trailing debounce once file events arrive', async () => {
    const host = watchableHost({ w1: EXPRESS_WORKTREE })
    const service = new SystemGraphService(host)
    const buildGraph = vi.spyOn(service, 'buildGraph')

    await service.watch('w1')
    host.emit(EXPRESS_WORKTREE.rootPath, [{ kind: 'update', absolutePath: '/repo/server.ts' }])
    expect(buildGraph).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(WATCH_BATCH_MAX_WAIT_MS)

    expect(buildGraph).toHaveBeenCalledTimes(1)
    expect(buildGraph).toHaveBeenCalledWith('w1')
  })

  it('coalesces a burst of events into a single rebuild', async () => {
    const host = watchableHost({ w1: EXPRESS_WORKTREE })
    const service = new SystemGraphService(host)
    const buildGraph = vi.spyOn(service, 'buildGraph')

    await service.watch('w1')
    for (let i = 0; i < 5; i += 1) {
      host.emit(EXPRESS_WORKTREE.rootPath, [{ kind: 'update', absolutePath: '/repo/server.ts' }])
    }
    await vi.advanceTimersByTimeAsync(WATCH_BATCH_MAX_WAIT_MS)

    expect(buildGraph).toHaveBeenCalledTimes(1)
  })

  it('forces an immediate full rebuild on an overflow event', async () => {
    const host = watchableHost({ w1: EXPRESS_WORKTREE })
    const service = new SystemGraphService(host)
    const buildGraph = vi.spyOn(service, 'buildGraph')

    await service.watch('w1')
    host.emit(EXPRESS_WORKTREE.rootPath, [{ kind: 'overflow', absolutePath: '/repo' }])
    await vi.advanceTimersByTimeAsync(0)

    expect(buildGraph).toHaveBeenCalledTimes(1)
  })

  it('disposes the watch and drops the map entry on a terminal error', async () => {
    const host = watchableHost({ w1: EXPRESS_WORKTREE })
    const service = new SystemGraphService(host)

    await service.watch('w1')
    const release = host.releaseSpy(EXPRESS_WORKTREE.rootPath)!
    host.triggerTerminalError(EXPRESS_WORKTREE.rootPath, new Error('watch died'))
    await vi.advanceTimersByTimeAsync(0)

    expect(release).toHaveBeenCalledTimes(1)

    // Idempotent: the entry is already gone, a second dispose must not throw or re-release.
    await expect(service.dispose('w1')).resolves.not.toThrow()
    expect(release).toHaveBeenCalledTimes(1)
  })

  it('dispose() releases the watch, cancels pending timers, and is idempotent', async () => {
    const host = watchableHost({ w1: EXPRESS_WORKTREE })
    const service = new SystemGraphService(host)
    const buildGraph = vi.spyOn(service, 'buildGraph')

    await service.watch('w1')
    host.emit(EXPRESS_WORKTREE.rootPath, [{ kind: 'update', absolutePath: '/repo/server.ts' }])
    await service.dispose('w1')

    const release = host.releaseSpy(EXPRESS_WORKTREE.rootPath)!
    expect(release).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(WATCH_BATCH_MAX_WAIT_MS)
    expect(buildGraph).not.toHaveBeenCalled()

    await expect(service.dispose('w1')).resolves.not.toThrow()
    expect(release).toHaveBeenCalledTimes(1)
  })

  it('disposeAll() releases every watch', async () => {
    const host = watchableHost({ w1: EXPRESS_WORKTREE, w2: NON_EXPRESS_WORKTREE })
    const service = new SystemGraphService(host)

    await service.watch('w1')
    await service.watch('w2')
    await service.disposeAll()

    expect(host.releaseSpy(EXPRESS_WORKTREE.rootPath)).toHaveBeenCalledTimes(1)
    expect(host.releaseSpy(NON_EXPRESS_WORKTREE.rootPath)).toHaveBeenCalledTimes(1)
  })

  it('reconcile() drops graphs and watches for worktree ids no longer live', async () => {
    const host = watchableHost({ w1: EXPRESS_WORKTREE, w2: NON_EXPRESS_WORKTREE })
    const service = new SystemGraphService(host)

    await service.buildGraph('w1')
    await service.watch('w1')
    await service.watch('w2')
    host.liveWorktreeIds.delete('w1')

    await service.reconcile()

    expect(host.releaseSpy(EXPRESS_WORKTREE.rootPath)).toHaveBeenCalledTimes(1)
    expect(service.getGraph('w1')).toBeUndefined()
    expect(host.releaseSpy(NON_EXPRESS_WORKTREE.rootPath)).not.toHaveBeenCalled()

    // w2's watch must still be live after reconcile.
    const buildGraph = vi.spyOn(service, 'buildGraph')
    host.emit(NON_EXPRESS_WORKTREE.rootPath, [{ kind: 'update', absolutePath: '/repo/x.ts' }])
    await vi.advanceTimersByTimeAsync(WATCH_BATCH_MAX_WAIT_MS)
    expect(buildGraph).toHaveBeenCalledWith('w2')
  })
})

describe('getSystemGraphService', () => {
  it('returns the same service instance for the same runtime object', () => {
    const runtime = fakeHost({})
    expect(getSystemGraphService(runtime)).toBe(getSystemGraphService(runtime))
  })

  it('returns different service instances for different runtime objects', () => {
    expect(getSystemGraphService(fakeHost({}))).not.toBe(getSystemGraphService(fakeHost({})))
  })
})
