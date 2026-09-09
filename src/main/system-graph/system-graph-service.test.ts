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
  files: Record<string, string> // relative posix path (may be nested) -> text content
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
    // Derives directory listings from the flat `files` map's keys, so a fixture can use
    // nested paths like 'src/routes/users.ts' without a real filesystem.
    readDir: async (absPath) => {
      const rel = relOf(absPath)
      const prefix = rel === '.' ? '' : `${rel}/`
      const children = new Map<string, boolean>()
      for (const filePath of Object.keys(worktree.files)) {
        if (!filePath.startsWith(prefix)) {
          continue
        }
        const remainder = filePath.slice(prefix.length)
        if (remainder.length === 0) {
          continue
        }
        const slashIndex = remainder.indexOf('/')
        if (slashIndex === -1) {
          children.set(remainder, false)
        } else if (!children.has(remainder.slice(0, slashIndex))) {
          children.set(remainder.slice(0, slashIndex), true)
        }
      }
      return [...children.entries()].map(([name, isDirectory]) => ({
        name,
        isDirectory,
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
  emit: (worktreeId: string, events: FsChangeEvent[]) => void
  triggerTerminalError: (worktreeId: string, error: Error) => void
  releaseSpy: (worktreeId: string) => ReturnType<typeof vi.fn> | undefined
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
    watchWorktreeFiles: async (worktreeId, onEvents, onTerminalError) => {
      const release = vi.fn(async () => {})
      handlers.set(worktreeId, { onEvents, onTerminalError, release })
      return release
    },
    listLiveWorktreeIds: () => liveWorktreeIds,
    emit: (worktreeId, events) => handlers.get(worktreeId)?.onEvents(events),
    triggerTerminalError: (worktreeId, error) => handlers.get(worktreeId)?.onTerminalError(error),
    releaseSpy: (worktreeId) => handlers.get(worktreeId)?.release,
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

// Mirrors EXPRESS_WORKTREE, but nested (per README of readDir above) and exercising the
// Fastify cross-file plugin-registration path: app.ts never declares an endpoint itself —
// it only registers two plugins, one prefixed, one not.
const FASTIFY_WORKTREE: FakeWorktree = {
  rootPath: '/repo/fastify-app',
  connectionId: 'ssh-fastify',
  files: {
    'package.json': JSON.stringify({ dependencies: { fastify: '^4.19.0', pg: '^8.11.0' } }),
    'tsconfig.json': '{}',
    'src/app.ts': [
      "import Fastify from 'fastify'",
      "import usersPlugin from './routes/users'",
      "import authPlugin from './routes/auth'",
      'const app = Fastify()',
      "app.register(usersPlugin, { prefix: '/api' })",
      'app.register(authPlugin)'
    ].join('\n'),
    'src/routes/users.ts': [
      "import userService from '../services/user.service'",
      'async function usersPlugin(fastify, opts) {',
      "  fastify.get('/', async () => userService.list())",
      "  fastify.get('/:id', async () => userService.get())",
      "  fastify.route({ method: ['POST', 'PUT'], url: '/' })",
      '}',
      'export default usersPlugin'
    ].join('\n'),
    'src/routes/auth.ts': [
      'async function authPlugin(fastify, opts) {',
      "  fastify.post('/login', async () => 'ok')",
      '}',
      'export default authPlugin'
    ].join('\n'),
    'src/services/user.service.ts': ['export default {', '  list() {},', '  get() {}', '}'].join(
      '\n'
    )
  }
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
    host.emit('w1', [{ kind: 'update', absolutePath: '/repo/server.ts' }])
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
      host.emit('w1', [{ kind: 'update', absolutePath: '/repo/server.ts' }])
    }
    await vi.advanceTimersByTimeAsync(WATCH_BATCH_MAX_WAIT_MS)

    expect(buildGraph).toHaveBeenCalledTimes(1)
  })

  it('forces an immediate full rebuild on an overflow event', async () => {
    const host = watchableHost({ w1: EXPRESS_WORKTREE })
    const service = new SystemGraphService(host)
    const buildGraph = vi.spyOn(service, 'buildGraph')

    await service.watch('w1')
    host.emit('w1', [{ kind: 'overflow', absolutePath: '/repo' }])
    await vi.advanceTimersByTimeAsync(0)

    expect(buildGraph).toHaveBeenCalledTimes(1)
  })

  it('disposes the watch and drops the map entry on a terminal error', async () => {
    const host = watchableHost({ w1: EXPRESS_WORKTREE })
    const service = new SystemGraphService(host)

    await service.watch('w1')
    const release = host.releaseSpy('w1')!
    host.triggerTerminalError('w1', new Error('watch died'))
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
    host.emit('w1', [{ kind: 'update', absolutePath: '/repo/server.ts' }])
    await service.dispose('w1')

    const release = host.releaseSpy('w1')!
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

    expect(host.releaseSpy('w1')).toHaveBeenCalledTimes(1)
    expect(host.releaseSpy('w2')).toHaveBeenCalledTimes(1)
  })

  it('reconcile() drops graphs and watches for worktree ids no longer live', async () => {
    const host = watchableHost({ w1: EXPRESS_WORKTREE, w2: NON_EXPRESS_WORKTREE })
    const service = new SystemGraphService(host)

    await service.buildGraph('w1')
    await service.watch('w1')
    await service.watch('w2')
    host.liveWorktreeIds.delete('w1')

    await service.reconcile()

    expect(host.releaseSpy('w1')).toHaveBeenCalledTimes(1)
    expect(service.getGraph('w1')).toBeUndefined()
    expect(host.releaseSpy('w2')).not.toHaveBeenCalled()

    // w2's watch must still be live after reconcile.
    const buildGraph = vi.spyOn(service, 'buildGraph')
    host.emit('w2', [{ kind: 'update', absolutePath: '/repo/x.ts' }])
    await vi.advanceTimersByTimeAsync(WATCH_BATCH_MAX_WAIT_MS)
    expect(buildGraph).toHaveBeenCalledWith('w2')
  })
})

describe('SystemGraphService.ensureWatched', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('arms the watch and populates the graph on first call', async () => {
    const host = watchableHost({ w1: EXPRESS_WORKTREE })
    const service = new SystemGraphService(host)

    await service.ensureWatched('w1')

    expect(service.getGraph('w1')?.nodes.size).toBeGreaterThan(0)
    expect(host.releaseSpy('w1')).toBeDefined()
  })

  it('does not re-arm the watch or rebuild on a second call', async () => {
    const host = watchableHost({ w1: EXPRESS_WORKTREE })
    const service = new SystemGraphService(host)
    const buildGraph = vi.spyOn(service, 'buildGraph')

    await service.ensureWatched('w1')
    await service.ensureWatched('w1')

    expect(buildGraph).toHaveBeenCalledTimes(1)
    // Re-arming would dispose() the first watch, releasing it — must not happen.
    expect(host.releaseSpy('w1')).not.toHaveBeenCalled()
  })

  it('does not throw and leaves the graph empty for an unresolvable worktree id', async () => {
    const service = new SystemGraphService(fakeHost({}))

    await expect(service.ensureWatched('missing')).resolves.not.toThrow()
    expect(service.getGraph('missing')).toBeUndefined()
  })
})

describe('SystemGraphService.subscribe', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('notifies a subscriber after a watcher-driven rebuild', async () => {
    const host = watchableHost({ w1: EXPRESS_WORKTREE })
    const service = new SystemGraphService(host)
    const listener = vi.fn()
    service.subscribe('w1', listener)

    await service.watch('w1')
    host.emit('w1', [{ kind: 'update', absolutePath: '/repo/server.ts' }])
    expect(listener).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(WATCH_BATCH_MAX_WAIT_MS)

    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('coalesces a burst of events into a single notification', async () => {
    const host = watchableHost({ w1: EXPRESS_WORKTREE })
    const service = new SystemGraphService(host)
    const listener = vi.fn()
    service.subscribe('w1', listener)

    await service.watch('w1')
    for (let i = 0; i < 3; i += 1) {
      host.emit('w1', [{ kind: 'update', absolutePath: '/repo/server.ts' }])
    }
    await vi.advanceTimersByTimeAsync(WATCH_BATCH_MAX_WAIT_MS)

    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('notifies immediately on an overflow event, without waiting for the trailing window', async () => {
    const host = watchableHost({ w1: EXPRESS_WORKTREE })
    const service = new SystemGraphService(host)
    const listener = vi.fn()
    service.subscribe('w1', listener)

    await service.watch('w1')
    host.emit('w1', [{ kind: 'overflow', absolutePath: '/repo' }])
    await vi.advanceTimersByTimeAsync(0)

    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('stops notifying after unsubscribe', async () => {
    const host = watchableHost({ w1: EXPRESS_WORKTREE })
    const service = new SystemGraphService(host)
    const listener = vi.fn()
    const unsubscribe = service.subscribe('w1', listener)
    unsubscribe()

    await service.watch('w1')
    host.emit('w1', [{ kind: 'update', absolutePath: '/repo/server.ts' }])
    await vi.advanceTimersByTimeAsync(WATCH_BATCH_MAX_WAIT_MS)

    expect(listener).not.toHaveBeenCalled()
  })

  it('does not notify a subscriber of a different worktree', async () => {
    const host = watchableHost({ w1: EXPRESS_WORKTREE, w2: NON_EXPRESS_WORKTREE })
    const service = new SystemGraphService(host)
    const listenerA = vi.fn()
    service.subscribe('w1', listenerA)

    await service.watch('w2')
    host.emit('w2', [{ kind: 'update', absolutePath: '/repo/x.ts' }])
    await vi.advanceTimersByTimeAsync(WATCH_BATCH_MAX_WAIT_MS)

    expect(listenerA).not.toHaveBeenCalled()
  })

  it('keeps subscribers across dispose() and a subsequent rebuild', async () => {
    const host = watchableHost({ w1: EXPRESS_WORKTREE })
    const service = new SystemGraphService(host)
    const listener = vi.fn()
    service.subscribe('w1', listener)

    await service.ensureWatched('w1')
    expect(listener).toHaveBeenCalledTimes(1)

    await service.dispose('w1')
    await service.ensureWatched('w1')

    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('does not notify when a rebuild resolves to no worktree', async () => {
    const service = new SystemGraphService(fakeHost({}))
    const listener = vi.fn()
    service.subscribe('missing', listener)

    await service.buildGraph('missing')

    expect(listener).not.toHaveBeenCalled()
  })

  it('notifies a subscriber added before the first ensureWatched build', async () => {
    const host = watchableHost({ w1: EXPRESS_WORKTREE })
    const service = new SystemGraphService(host)
    const listener = vi.fn()
    service.subscribe('w1', listener)

    await service.ensureWatched('w1')

    expect(listener).toHaveBeenCalledTimes(1)
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

describe('SystemGraphService: fastify worktree golden (cross-file plugin registration)', () => {
  it('crawls, detects fastify, and composes endpoint paths across app.ts and its two plugin files', async () => {
    const service = new SystemGraphService(fakeHost({ w1: FASTIFY_WORKTREE }))

    await service.buildGraph('w1')
    const graph = service.getGraph('w1')!
    const nodes = [...graph.nodes.values()]

    // app.ts declares zero endpoints of its own (only .register() calls) -> no router node.
    expect(graph.nodes.has('router:src/app.ts')).toBe(false)
    expect(graph.nodes.has('router:src/routes/users.ts')).toBe(true)
    expect(graph.nodes.has('router:src/routes/auth.ts')).toBe(true)

    const endpointLabels = nodes.filter((n) => n.kind === 'endpoint').map((n) => n.label)
    expect(endpointLabels).toContain('GET /api/')
    expect(endpointLabels).toContain('GET /api/:id')
    expect(endpointLabels).toContain('POST /api/')
    expect(endpointLabels).toContain('PUT /api/')
    // auth.ts was registered with no prefix -> its endpoint stays uncomposed.
    expect(endpointLabels).toContain('POST /login')

    expect(nodes.some((n) => n.kind === 'database' && n.label === 'PostgreSQL')).toBe(true)
    // The registered plugin imports ('./routes/users', './routes/auth') must NOT also turn
    // into spurious service nodes — only the real service import should produce one.
    const serviceLabels = nodes.filter((n) => n.kind === 'service').map((n) => n.label)
    expect(serviceLabels).toEqual(['user.service'])
  })
})
