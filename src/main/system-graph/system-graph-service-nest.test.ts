import { posix } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { IFilesystemProvider } from '../providers/types'
import { SystemGraphService, type SystemGraphHost } from './system-graph-service'

/** Sibling to system-graph-service.test.ts (over the 800-line test cap otherwise) — duplicates
 * its minimal in-memory worktree plumbing so this file stays self-contained. */
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

// Mirrors EXPRESS_WORKTREE/FASTIFY_WORKTREE in system-graph-service.test.ts: main.ts wires
// AppModule through NestFactory; app.module.ts is a pure @Module() descriptor with no endpoints
// of its own (must not become a router OR a service node); users.controller.ts and
// auth.controller.ts are the only files with @Controller — one router node each.
const NEST_WORKTREE: FakeWorktree = {
  rootPath: '/repo/nest-app',
  connectionId: 'ssh-nest',
  files: {
    'package.json': JSON.stringify({
      dependencies: {
        '@nestjs/core': '^10.0.0',
        '@nestjs/common': '^10.0.0',
        '@nestjs/platform-express': '^10.0.0',
        typeorm: '^0.3.0',
        pg: '^8.11.0'
      },
      devDependencies: { '@types/express': '^4.17.0', typescript: '^5.5.0' }
    }),
    'src/main.ts': [
      "import { NestFactory } from '@nestjs/core'",
      "import { AppModule } from './app.module'",
      'async function bootstrap() {',
      '  const app = await NestFactory.create(AppModule)',
      '  await app.listen(3000)',
      '}',
      'bootstrap()'
    ].join('\n'),
    'src/app.module.ts': [
      "import { Module } from '@nestjs/common'",
      "import { UsersController } from './users/users.controller'",
      "import { AuthController } from './auth/auth.controller'",
      "import { UsersService } from './users/users.service'",
      '@Module({',
      '  controllers: [UsersController, AuthController],',
      '  providers: [UsersService]',
      '})',
      'export class AppModule {}'
    ].join('\n'),
    'src/users/users.controller.ts': [
      "import { Controller, Get, Post } from '@nestjs/common'",
      "import { UsersService } from './users.service'",
      '@Controller("users")',
      'export class UsersController {',
      '  constructor(private readonly usersService: UsersService) {}',
      '  @Get()',
      '  list() {}',
      '  @Get(":id")',
      '  find() {}',
      '  @Post()',
      '  create() {}',
      '}'
    ].join('\n'),
    'src/users/users.service.ts': [
      "import { Injectable } from '@nestjs/common'",
      "import { Repository } from 'typeorm'",
      '@Injectable()',
      'export class UsersService {',
      '  constructor(private readonly repo: Repository<unknown>) {}',
      '}'
    ].join('\n'),
    'src/auth/auth.controller.ts': [
      "import { Controller, Post } from '@nestjs/common'",
      '@Controller("auth")',
      'export class AuthController {',
      '  @Post("login")',
      '  login() {}',
      '}'
    ].join('\n')
  }
}

describe('SystemGraphService: nest worktree golden', () => {
  it('detects nest, routes only through the controller files, and keeps the module/entry files out of the graph', async () => {
    const service = new SystemGraphService(fakeHost({ w1: NEST_WORKTREE }))

    await service.buildGraph('w1')
    const graph = service.getGraph('w1')!
    const nodes = [...graph.nodes.values()]

    expect(graph.nodes.has('router:src/main.ts')).toBe(false)
    expect(graph.nodes.has('router:src/app.module.ts')).toBe(false)
    expect(graph.nodes.has('router:src/users/users.controller.ts')).toBe(true)
    expect(graph.nodes.has('router:src/auth/auth.controller.ts')).toBe(true)

    const endpointLabels = nodes.filter((n) => n.kind === 'endpoint').map((n) => n.label)
    expect(endpointLabels).toContain('GET /users')
    expect(endpointLabels).toContain('GET /users/:id')
    expect(endpointLabels).toContain('POST /users')
    expect(endpointLabels).toContain('POST /auth/login')

    // The entry file (main.ts) and the @Module() descriptor (app.module.ts) must not leak in
    // as bogus service nodes just because they have relative imports and zero endpoints.
    const serviceLabels = nodes.filter((n) => n.kind === 'service').map((n) => n.label)
    expect(serviceLabels).toEqual(['users.service'])

    // typeorm+pg: the concrete engine (pg) collapses the generic ORM label (typeorm) away.
    const databaseLabels = nodes
      .filter((n) => n.kind === 'database')
      .map((n) => n.label)
      .sort()
    expect(databaseLabels).toEqual(['PostgreSQL'])

    expect(graph.edges).toContainEqual({
      from: 'router:src/users/users.controller.ts',
      to: 'service:users.service',
      kind: 'flow'
    })
    expect(graph.edges).toContainEqual({
      from: 'service:users.service',
      to: 'database:PostgreSQL',
      kind: 'faint'
    })
    expect(graph.edges).not.toContainEqual(expect.objectContaining({ to: 'database:SQL Database' }))
  })
})
