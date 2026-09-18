import { posix } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { IFilesystemProvider } from '../providers/types'
import { SystemGraphService, type SystemGraphHost } from './system-graph-service'

/** Sibling to system-graph-service.test.ts / system-graph-service-nest.test.ts (over the 800-line
 * test cap otherwise) — duplicates the minimal in-memory worktree plumbing so this file stays
 * self-contained. */
type FakeWorktree = {
  rootPath: string
  connectionId: string
  files: Record<string, string>
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

// index.ts owns the top-level '/health' endpoint plus two cross-file mounts: a named-import
// target (users.ts) and a namespace-import property-access target (authRoutes.auth, auth.ts).
// users.ts exercises the fluent-chain form (TFW-003) as the default local mount target;
// auth.ts exercises statement-style (TFW-002) reached via TFW-004's namespace-import branch.
// user-service.ts has no Hono import and zero endpoints — pure TFW-005 service-node bait.
const HONO_WORKTREE: FakeWorktree = {
  rootPath: '/repo/hono-app',
  connectionId: 'ssh-hono',
  files: {
    'package.json': JSON.stringify({
      dependencies: { hono: '^4.0.0', pg: '^8.11.0' },
      devDependencies: { typescript: '^5.5.0' }
    }),
    'src/index.ts': [
      "import { Hono } from 'hono'",
      "import { users } from './routes/users'",
      "import * as authRoutes from './routes/auth'",
      'const app = new Hono()',
      "app.route('/users', users)",
      "app.route('/auth', authRoutes.auth)",
      "app.get('/health', h)"
    ].join('\n'),
    'src/routes/users.ts': [
      "import { userService } from '../services/user-service'",
      "export const users = new Hono().get('/', h).get('/:id', h).post('/', h)"
    ].join('\n'),
    'src/routes/auth.ts': ['export const auth = new Hono()', "auth.post('/login', h)"].join('\n'),
    'src/services/user-service.ts': [
      'export const userService = {',
      '  findAll: () => []',
      '}'
    ].join('\n')
  }
}

describe('SystemGraphService: hono worktree golden', () => {
  it('detects hono, routes across statement/fluent-chain/namespace-import mounts, and derives service+database nodes', async () => {
    const service = new SystemGraphService(fakeHost({ w1: HONO_WORKTREE }))

    await service.buildGraph('w1')
    const graph = service.getGraph('w1')!
    const nodes = [...graph.nodes.values()]

    expect(graph.nodes.has('router:src/index.ts')).toBe(true)
    expect(graph.nodes.has('router:src/routes/users.ts')).toBe(true)
    expect(graph.nodes.has('router:src/routes/auth.ts')).toBe(true)
    expect(graph.nodes.has('router:src/services/user-service.ts')).toBe(false)

    const endpointLabels = nodes.filter((n) => n.kind === 'endpoint').map((n) => n.label)
    // users.ts's fluent-chain '/' endpoints compose to a trailing slash after the '/users'
    // cross-file mount prefix — same concatenation convention as the existing Express/Fastify
    // goldens (e.g. 'GET /api/' from a plugin mounted at '/api' with its own '/' route).
    expect(endpointLabels).toContain('GET /users/')
    expect(endpointLabels).toContain('GET /users/:id')
    expect(endpointLabels).toContain('POST /users/')
    expect(endpointLabels).toContain('POST /auth/login')
    expect(endpointLabels).toContain('GET /health')

    const serviceLabels = nodes.filter((n) => n.kind === 'service').map((n) => n.label)
    expect(serviceLabels).toEqual(['user-service'])

    const databaseLabels = nodes.filter((n) => n.kind === 'database').map((n) => n.label)
    expect(databaseLabels).toEqual(['PostgreSQL'])

    expect(graph.edges).toContainEqual({
      from: 'router:src/routes/users.ts',
      to: 'service:user-service',
      kind: 'flow'
    })
    expect(graph.edges).toContainEqual({
      from: 'service:user-service',
      to: 'database:PostgreSQL',
      kind: 'faint'
    })
  })
})
