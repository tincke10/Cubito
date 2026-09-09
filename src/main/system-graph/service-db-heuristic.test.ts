import { describe, expect, it } from 'vitest'
import { parseExpressRoutes, type ParsedRouteFile } from './express-route-parser'
import { parseFastifyRoutes } from './fastify-route-parser'
import { assembleSystemGraph, deriveServiceAndDatabaseNodes } from './service-db-heuristic'

function routeFile(overrides: Partial<ParsedRouteFile> & { filePath: string }): ParsedRouteFile {
  return { endpoints: [], mounts: [], imports: [], exports: [], ...overrides }
}

describe('deriveServiceAndDatabaseNodes: database client detection', () => {
  const cases: [string, string][] = [
    ['pg', 'PostgreSQL'],
    ['postgres', 'PostgreSQL'],
    ['mysql', 'MySQL'],
    ['mysql2', 'MySQL'],
    ['mongodb', 'MongoDB'],
    ['mongoose', 'MongoDB'],
    ['sqlite3', 'SQLite'],
    ['better-sqlite3', 'SQLite'],
    ['redis', 'Redis'],
    ['ioredis', 'Redis'],
    ['@prisma/client', 'Prisma'],
    ['prisma', 'Prisma'],
    ['typeorm', 'SQL Database'],
    ['sequelize', 'SQL Database'],
    ['knex', 'SQL Database'],
    ['drizzle-orm', 'SQL Database'],
    ['mssql', 'SQL Server'],
    ['cassandra-driver', 'Cassandra']
  ]

  it.each(cases)('maps dependency %s to database label %s', (dep, label) => {
    const result = deriveServiceAndDatabaseNodes({ routeFiles: [], packageDependencies: [dep] })
    expect(result.databaseNodes).toEqual([
      { id: `database:${label}`, kind: 'database', label, diff: null }
    ])
  })

  it('dedupes multiple client packages for the same database family', () => {
    const result = deriveServiceAndDatabaseNodes({
      routeFiles: [],
      packageDependencies: ['pg', 'postgres']
    })
    expect(result.databaseNodes).toEqual([
      { id: 'database:PostgreSQL', kind: 'database', label: 'PostgreSQL', diff: null }
    ])
  })

  it('returns no database nodes when no known client is present', () => {
    const result = deriveServiceAndDatabaseNodes({
      routeFiles: [],
      packageDependencies: ['express', 'lodash']
    })
    expect(result.databaseNodes).toEqual([])
  })

  it('produces one node per distinct family across several deps at once', () => {
    const result = deriveServiceAndDatabaseNodes({
      routeFiles: [],
      packageDependencies: ['pg', 'ioredis', 'mongoose']
    })
    expect(result.databaseNodes.map((n) => n.label).sort()).toEqual([
      'MongoDB',
      'PostgreSQL',
      'Redis'
    ])
  })

  // A generic ORM label is noise once the concrete engine it's talking to is also detected.
  it('collapses to the concrete engine when a generic ORM and its concrete driver are both present (typeorm+pg)', () => {
    const result = deriveServiceAndDatabaseNodes({
      routeFiles: [],
      packageDependencies: ['typeorm', 'pg']
    })
    expect(result.databaseNodes).toEqual([
      { id: 'database:PostgreSQL', kind: 'database', label: 'PostgreSQL', diff: null }
    ])
  })

  it('collapses to the concrete engine for sequelize+mysql2', () => {
    const result = deriveServiceAndDatabaseNodes({
      routeFiles: [],
      packageDependencies: ['sequelize', 'mysql2']
    })
    expect(result.databaseNodes).toEqual([
      { id: 'database:MySQL', kind: 'database', label: 'MySQL', diff: null }
    ])
  })

  it('collapses to the concrete engine for drizzle-orm+mongoose', () => {
    const result = deriveServiceAndDatabaseNodes({
      routeFiles: [],
      packageDependencies: ['drizzle-orm', 'mongoose']
    })
    expect(result.databaseNodes).toEqual([
      { id: 'database:MongoDB', kind: 'database', label: 'MongoDB', diff: null }
    ])
  })

  it('falls back to the generic label when no concrete engine is present (typeorm alone)', () => {
    const result = deriveServiceAndDatabaseNodes({
      routeFiles: [],
      packageDependencies: ['typeorm']
    })
    expect(result.databaseNodes).toEqual([
      { id: 'database:SQL Database', kind: 'database', label: 'SQL Database', diff: null }
    ])
  })
})

describe('deriveServiceAndDatabaseNodes: service grouping from relative imports', () => {
  it('groups a relative import by its immediate module name', () => {
    const files = [
      routeFile({
        filePath: 'src/routes/users.ts',
        imports: [{ moduleSpecifier: './services/user-service', isRelative: true }]
      })
    ]
    const result = deriveServiceAndDatabaseNodes({ routeFiles: files, packageDependencies: [] })
    expect(result.serviceNodes).toEqual([
      { id: 'service:user-service', kind: 'service', label: 'user-service', diff: null }
    ])
  })

  it('ignores non-relative (package) imports', () => {
    const files = [
      routeFile({
        filePath: 'src/routes/users.ts',
        imports: [{ moduleSpecifier: 'express', isRelative: false }]
      })
    ]
    const result = deriveServiceAndDatabaseNodes({ routeFiles: files, packageDependencies: [] })
    expect(result.serviceNodes).toEqual([])
  })

  // Unit-level lock for the "endpoints>0" branch of isRouteModuleImport, in isolation from any
  // parser: an unprefixed cross-file mount never lands in file.mounts (only a prefixed one does),
  // so exclusion must come from the imported file having endpoints of its own, not from `mounts`.
  it('excludes a relative import from serviceNodes when its target file has endpoints, even with an empty mounts array', () => {
    const importer = routeFile({
      filePath: 'src/index.ts',
      mounts: [],
      imports: [
        {
          moduleSpecifier: './routes/users',
          isRelative: true,
          bindings: [{ localName: 'usersRouter', importedName: 'default' }]
        }
      ]
    })
    const usersRouteModule = routeFile({
      filePath: 'src/routes/users.ts',
      endpoints: [{ method: 'GET', path: '/', routerLocalName: 'router' }]
    })
    const result = deriveServiceAndDatabaseNodes({
      routeFiles: [importer, usersRouteModule],
      packageDependencies: []
    })
    expect(result.serviceNodes).toEqual([])
  })

  it('collapses a trailing index segment to the parent directory name', () => {
    const files = [
      routeFile({
        filePath: 'src/routes/users.ts',
        imports: [{ moduleSpecifier: './services/user/index', isRelative: true }]
      })
    ]
    const result = deriveServiceAndDatabaseNodes({ routeFiles: files, packageDependencies: [] })
    expect(result.serviceNodes).toEqual([
      { id: 'service:user', kind: 'service', label: 'user', diff: null }
    ])
  })

  it('dedupes the same module name imported from multiple route files', () => {
    const files = [
      routeFile({
        filePath: 'src/routes/a.ts',
        imports: [{ moduleSpecifier: './services/user-service', isRelative: true }]
      }),
      routeFile({
        filePath: 'src/routes/b.ts',
        imports: [{ moduleSpecifier: '../services/user-service', isRelative: true }]
      })
    ]
    const result = deriveServiceAndDatabaseNodes({ routeFiles: files, packageDependencies: [] })
    expect(result.serviceNodes).toEqual([
      { id: 'service:user-service', kind: 'service', label: 'user-service', diff: null }
    ])
  })

  it('caps distinct service nodes at 24, keeping first-seen order', () => {
    const files = [
      routeFile({
        filePath: 'src/routes/a.ts',
        imports: Array.from({ length: 30 }, (_, i) => ({
          moduleSpecifier: `./services/service-${i}`,
          isRelative: true
        }))
      })
    ]
    const result = deriveServiceAndDatabaseNodes({ routeFiles: files, packageDependencies: [] })
    expect(result.serviceNodes).toHaveLength(24)
    expect(result.serviceNodes[0].id).toBe('service:service-0')
    expect(result.serviceNodes[23].id).toBe('service:service-23')
  })
})

describe('deriveServiceAndDatabaseNodes: edges', () => {
  it('adds a flow edge from a route file with endpoints to the service it imports', () => {
    const files = [
      routeFile({
        filePath: 'src/routes/users.ts',
        endpoints: [{ method: 'GET', path: '/users', routerLocalName: 'router' }],
        imports: [{ moduleSpecifier: './services/user-service', isRelative: true }]
      })
    ]
    const result = deriveServiceAndDatabaseNodes({ routeFiles: files, packageDependencies: [] })
    expect(result.edges).toContainEqual({
      from: 'router:src/routes/users.ts',
      to: 'service:user-service',
      kind: 'flow'
    })
  })

  it('does not add a flow edge for a route file with no endpoints', () => {
    const files = [
      routeFile({
        filePath: 'src/routes/dead.ts',
        endpoints: [],
        imports: [{ moduleSpecifier: './services/user-service', isRelative: true }]
      })
    ]
    const result = deriveServiceAndDatabaseNodes({ routeFiles: files, packageDependencies: [] })
    expect(result.edges).toEqual([])
  })

  it('dedupes repeated flow edges from the same file to the same service', () => {
    const files = [
      routeFile({
        filePath: 'src/routes/users.ts',
        endpoints: [{ method: 'GET', path: '/users', routerLocalName: 'router' }],
        imports: [
          { moduleSpecifier: './services/user-service', isRelative: true },
          { moduleSpecifier: '../services/user-service', isRelative: true }
        ]
      })
    ]
    const result = deriveServiceAndDatabaseNodes({ routeFiles: files, packageDependencies: [] })
    const flowEdges = result.edges.filter((e) => e.kind === 'flow')
    expect(flowEdges).toEqual([
      { from: 'router:src/routes/users.ts', to: 'service:user-service', kind: 'flow' }
    ])
  })

  it('links every service to every detected database with a faint edge (light heuristic)', () => {
    const files = [
      routeFile({
        filePath: 'src/routes/users.ts',
        endpoints: [{ method: 'GET', path: '/users', routerLocalName: 'router' }],
        imports: [
          { moduleSpecifier: './services/user-service', isRelative: true },
          { moduleSpecifier: './services/order-service', isRelative: true }
        ]
      })
    ]
    const result = deriveServiceAndDatabaseNodes({
      routeFiles: files,
      packageDependencies: ['pg', 'ioredis']
    })
    const faintEdges = result.edges.filter((e) => e.kind === 'faint')
    expect(faintEdges).toHaveLength(4)
    expect(faintEdges).toContainEqual({
      from: 'service:user-service',
      to: 'database:PostgreSQL',
      kind: 'faint'
    })
    expect(faintEdges).toContainEqual({
      from: 'service:order-service',
      to: 'database:Redis',
      kind: 'faint'
    })
  })

  it('targets only the concrete engine node for a faint edge when a generic ORM is also present', () => {
    const files = [
      routeFile({
        filePath: 'src/routes/users.ts',
        endpoints: [{ method: 'GET', path: '/users', routerLocalName: 'router' }],
        imports: [{ moduleSpecifier: './services/user-service', isRelative: true }]
      })
    ]
    const result = deriveServiceAndDatabaseNodes({
      routeFiles: files,
      packageDependencies: ['typeorm', 'pg']
    })
    const faintEdges = result.edges.filter((e) => e.kind === 'faint')
    expect(faintEdges).toEqual([
      { from: 'service:user-service', to: 'database:PostgreSQL', kind: 'faint' }
    ])
  })
})

describe('assembleSystemGraph: routers and endpoints', () => {
  it('creates a router node per route file that has endpoints, with endpoint nodes and a normal edge', () => {
    const files = [
      routeFile({
        filePath: 'src/routes/users.ts',
        endpoints: [{ method: 'GET', path: '/users', routerLocalName: 'router' }]
      })
    ]
    const graph = assembleSystemGraph({ routeFiles: files, packageDependencies: [] })

    expect(graph.nodes.get('router:src/routes/users.ts')).toEqual({
      id: 'router:src/routes/users.ts',
      kind: 'router',
      label: 'src/routes/users.ts',
      diff: null
    })
    expect(graph.nodes.get('endpoint:src/routes/users.ts#0')).toEqual({
      id: 'endpoint:src/routes/users.ts#0',
      kind: 'endpoint',
      label: 'GET /users',
      method: 'GET',
      path: '/users',
      diff: null
    })
    expect(graph.edges).toContainEqual({
      from: 'router:src/routes/users.ts',
      to: 'endpoint:src/routes/users.ts#0',
      kind: 'normal'
    })
  })

  it('skips a router node for a route file with zero endpoints', () => {
    const files = [routeFile({ filePath: 'src/routes/empty.ts', endpoints: [] })]
    const graph = assembleSystemGraph({ routeFiles: files, packageDependencies: [] })
    expect(graph.nodes.get('router:src/routes/empty.ts')).toBeUndefined()
  })

  it('composes a single mount prefix into the endpoint path', () => {
    const files = [
      routeFile({
        filePath: 'src/routes/users.ts',
        endpoints: [{ method: 'GET', path: '/ping', routerLocalName: 'router' }],
        mounts: [{ prefix: '/api', routerLocalName: 'router', parentLocalName: 'app' }]
      })
    ]
    const graph = assembleSystemGraph({ routeFiles: files, packageDependencies: [] })
    expect(graph.nodes.get('endpoint:src/routes/users.ts#0')).toMatchObject({
      path: '/api/ping',
      label: 'GET /api/ping'
    })
  })

  it('composes a transitive chain of mount prefixes into the endpoint path', () => {
    const files = [
      routeFile({
        filePath: 'src/routes/users.ts',
        endpoints: [{ method: 'GET', path: '/users', routerLocalName: 'v1' }],
        mounts: [
          { prefix: '/v1', routerLocalName: 'v1', parentLocalName: 'api' },
          { prefix: '/api', routerLocalName: 'api', parentLocalName: 'app' }
        ]
      })
    ]
    const graph = assembleSystemGraph({ routeFiles: files, packageDependencies: [] })
    expect(graph.nodes.get('endpoint:src/routes/users.ts#0')).toMatchObject({
      path: '/api/v1/users'
    })
  })

  it('composes a standalone <dynamic> mount prefix into the endpoint path', () => {
    const files = [
      routeFile({
        filePath: 'src/routes/users.ts',
        endpoints: [{ method: 'GET', path: '/ping', routerLocalName: 'router' }],
        mounts: [{ prefix: '<dynamic>', routerLocalName: 'router', parentLocalName: 'app' }]
      })
    ]
    const graph = assembleSystemGraph({ routeFiles: files, packageDependencies: [] })
    expect(graph.nodes.get('endpoint:src/routes/users.ts#0')).toMatchObject({
      path: '<dynamic>/ping'
    })
  })

  it('chains a <dynamic> prefix with a static outer prefix', () => {
    const files = [
      routeFile({
        filePath: 'src/routes/users.ts',
        endpoints: [{ method: 'GET', path: '/users', routerLocalName: 'v1' }],
        mounts: [
          { prefix: '<dynamic>', routerLocalName: 'v1', parentLocalName: 'api' },
          { prefix: '/api', routerLocalName: 'api', parentLocalName: 'app' }
        ]
      })
    ]
    const graph = assembleSystemGraph({ routeFiles: files, packageDependencies: [] })
    expect(graph.nodes.get('endpoint:src/routes/users.ts#0')).toMatchObject({
      path: '/api<dynamic>/users'
    })
  })

  it('keeps router ids unique across files that reuse the same local router name', () => {
    const files = [
      routeFile({
        filePath: 'src/routes/a.ts',
        endpoints: [{ method: 'GET', path: '/a', routerLocalName: 'router' }]
      }),
      routeFile({
        filePath: 'src/routes/b.ts',
        endpoints: [{ method: 'GET', path: '/b', routerLocalName: 'router' }]
      })
    ]
    const graph = assembleSystemGraph({ routeFiles: files, packageDependencies: [] })
    expect(graph.nodes.has('router:src/routes/a.ts')).toBe(true)
    expect(graph.nodes.has('router:src/routes/b.ts')).toBe(true)
    expect(graph.nodes.size).toBe(4) // 2 routers + 2 endpoints
  })
})

describe('assembleSystemGraph: full 4-tier composition', () => {
  it('assembles router -> endpoint -> service -> database in one graph', () => {
    const files = [
      routeFile({
        filePath: 'src/routes/users.ts',
        endpoints: [{ method: 'GET', path: '/users', routerLocalName: 'router' }],
        imports: [{ moduleSpecifier: './services/user-service', isRelative: true }]
      })
    ]
    const graph = assembleSystemGraph({
      routeFiles: files,
      packageDependencies: ['pg']
    })

    expect(graph.nodes.get('router:src/routes/users.ts')?.kind).toBe('router')
    expect(graph.nodes.get('endpoint:src/routes/users.ts#0')?.kind).toBe('endpoint')
    expect(graph.nodes.get('service:user-service')?.kind).toBe('service')
    expect(graph.nodes.get('database:PostgreSQL')?.kind).toBe('database')

    expect(graph.edges).toContainEqual({
      from: 'router:src/routes/users.ts',
      to: 'endpoint:src/routes/users.ts#0',
      kind: 'normal'
    })
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

  it('returns the empty graph shape for empty input', () => {
    const graph = assembleSystemGraph({ routeFiles: [], packageDependencies: [] })
    expect(graph.nodes).toBeInstanceOf(Map)
    expect(graph.nodes.size).toBe(0)
    expect(graph.edges).toEqual([])
  })

  it('produces only unique node ids even with overlapping router/service/database names', () => {
    const files = [
      routeFile({
        filePath: 'src/routes/users.ts',
        endpoints: [{ method: 'GET', path: '/users', routerLocalName: 'router' }],
        imports: [{ moduleSpecifier: './services/user-service', isRelative: true }]
      }),
      routeFile({
        filePath: 'src/routes/orders.ts',
        endpoints: [{ method: 'GET', path: '/orders', routerLocalName: 'router' }],
        imports: [{ moduleSpecifier: './services/user-service', isRelative: true }]
      })
    ]
    const graph = assembleSystemGraph({ routeFiles: files, packageDependencies: ['pg'] })
    const ids = [...graph.nodes.keys()]
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('assembleSystemGraph: golden through a real Fastify parse (same-file plugin mount)', () => {
  it('composes the plugin prefix into each endpoint path with zero framework-specific logic here', () => {
    const source = `
      const app = Fastify()
      async function usersPlugin(fastify, opts) {
        fastify.get('/', h)
        fastify.get('/:id', h)
      }
      app.register(usersPlugin, { prefix: '/users' })
    `
    const parsed = parseFastifyRoutes(source, 'src/app.ts')
    const graph = assembleSystemGraph({ routeFiles: [parsed], packageDependencies: [] })

    expect(graph.nodes.get('endpoint:src/app.ts#0')).toMatchObject({ path: '/users/' })
    expect(graph.nodes.get('endpoint:src/app.ts#1')).toMatchObject({ path: '/users/:id' })
  })
})

describe('assembleSystemGraph: golden through real parses of two Express files (cross-file mount)', () => {
  it('composes the prefix for a router imported and mounted from a different file', () => {
    const index = parseExpressRoutes(
      [
        "import usersRouter from './routes/users'",
        'const app = express()',
        "app.use('/users', usersRouter)"
      ].join('\n'),
      'src/index.ts'
    )
    const users = parseExpressRoutes(
      ['const router = express.Router()', "router.get('/', h)", 'export default router'].join('\n'),
      'src/routes/users.ts'
    )

    const graph = assembleSystemGraph({ routeFiles: [index, users], packageDependencies: [] })

    expect(graph.nodes.get('endpoint:src/routes/users.ts#0')).toMatchObject({ path: '/users/' })
  })
})

describe('assembleSystemGraph: golden through real parses of two Fastify files (cross-file registration)', () => {
  it('composes the prefix for a plugin imported and registered from a different file', () => {
    const app = parseFastifyRoutes(
      [
        "import usersPlugin from './routes/users'",
        'const server = Fastify()',
        "server.register(usersPlugin, { prefix: '/users' })"
      ].join('\n'),
      'src/app.ts'
    )
    const users = parseFastifyRoutes(
      [
        'async function usersPlugin(fastify, opts) {',
        "  fastify.get('/', h)",
        '}',
        'export default usersPlugin'
      ].join('\n'),
      'src/routes/users.ts'
    )

    const graph = assembleSystemGraph({ routeFiles: [app, users], packageDependencies: [] })

    expect(graph.nodes.get('endpoint:src/routes/users.ts#0')).toMatchObject({ path: '/users/' })
  })

  it('composes the prefix for an fp(...)-wrapped plugin registered from a different file', () => {
    const app = parseFastifyRoutes(
      [
        "import authPlugin from './routes/auth'",
        'const server = Fastify()',
        "server.register(fp(authPlugin), { prefix: '/auth' })"
      ].join('\n'),
      'src/app.ts'
    )
    const auth = parseFastifyRoutes(
      [
        'function authPlugin(fastify, opts) {',
        "  fastify.post('/login', h)",
        '}',
        'export default authPlugin'
      ].join('\n'),
      'src/routes/auth.ts'
    )

    const graph = assembleSystemGraph({ routeFiles: [app, auth], packageDependencies: [] })

    expect(graph.nodes.get('endpoint:src/routes/auth.ts#0')).toMatchObject({ path: '/auth/login' })
  })
})

describe('assembleSystemGraph: excludes mounted route modules from the service heuristic', () => {
  function serviceLabels(graph: ReturnType<typeof assembleSystemGraph>): string[] {
    return [...graph.nodes.values()].filter((n) => n.kind === 'service').map((n) => n.label)
  }

  it('Express: a cross-file-mounted router import never becomes a service node', () => {
    const index = parseExpressRoutes(
      [
        "import usersRouter from './routes/users'",
        'const app = express()',
        "app.use('/users', usersRouter)"
      ].join('\n'),
      'src/index.ts'
    )
    const users = parseExpressRoutes(
      [
        "import userService from '../services/user-service'",
        'const router = express.Router()',
        "router.get('/', (req, res) => userService.list())",
        'export default router'
      ].join('\n'),
      'src/routes/users.ts'
    )
    const userService = parseExpressRoutes('export default {}', 'src/services/user-service.ts')

    const graph = assembleSystemGraph({
      routeFiles: [index, users, userService],
      packageDependencies: []
    })

    expect(serviceLabels(graph)).not.toContain('users')
    expect(serviceLabels(graph)).toContain('user-service')
  })

  it('Fastify: cross-file-registered plugin imports never become service nodes', () => {
    const app = parseFastifyRoutes(
      [
        "import usersPlugin from './routes/users'",
        "import authPlugin from './routes/auth'",
        'const server = Fastify()',
        "server.register(usersPlugin, { prefix: '/api' })",
        'server.register(authPlugin)'
      ].join('\n'),
      'src/app.ts'
    )
    const users = parseFastifyRoutes(
      [
        "import userService from '../services/user.service'",
        'async function usersPlugin(fastify, opts) {',
        "  fastify.get('/', async () => userService.list())",
        '}',
        'export default usersPlugin'
      ].join('\n'),
      'src/routes/users.ts'
    )
    const auth = parseFastifyRoutes(
      [
        'async function authPlugin(fastify, opts) {',
        "  fastify.post('/login', async () => 'ok')",
        '}',
        'export default authPlugin'
      ].join('\n'),
      'src/routes/auth.ts'
    )
    const userService = parseFastifyRoutes('export default {}', 'src/services/user.service.ts')

    const graph = assembleSystemGraph({
      routeFiles: [app, users, auth, userService],
      packageDependencies: ['pg']
    })

    expect(serviceLabels(graph)).toEqual(['user.service'])
    expect(
      [...graph.nodes.values()].filter((n) => n.kind === 'database').map((n) => n.label)
    ).toEqual(['PostgreSQL'])
  })
})

// Nest-shaped wiring: an entry file (0 endpoints, no mounts) imports a module-descriptor file
// (0 endpoints, no mounts of its own) that in turn imports controller files (endpoints > 0).
// Neither the entry file nor the module-descriptor file is a data/service dependency — the
// module-descriptor is wiring, not a service, even though it never appears in any `mounts` array.
describe('deriveServiceAndDatabaseNodes: excludes a module-descriptor file reached only through another zero-endpoint file', () => {
  it('does not turn an entry-file import of a wiring module into a service node', () => {
    const main = routeFile({
      filePath: 'src/main.ts',
      imports: [
        {
          moduleSpecifier: './app.module',
          isRelative: true,
          bindings: [{ localName: 'AppModule', importedName: 'AppModule' }]
        }
      ]
    })
    const appModule = routeFile({
      filePath: 'src/app.module.ts',
      imports: [
        {
          moduleSpecifier: './users/users.controller',
          isRelative: true,
          bindings: [{ localName: 'UsersController', importedName: 'UsersController' }]
        }
      ]
    })
    const usersController = routeFile({
      filePath: 'src/users/users.controller.ts',
      endpoints: [{ method: 'GET', path: '/users', routerLocalName: 'UsersController' }]
    })

    const result = deriveServiceAndDatabaseNodes({
      routeFiles: [main, appModule, usersController],
      packageDependencies: []
    })

    expect(result.serviceNodes).toEqual([])
  })
})
