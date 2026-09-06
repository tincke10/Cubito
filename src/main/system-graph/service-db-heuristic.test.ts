import { describe, expect, it } from 'vitest'
import type { ParsedRouteFile } from './express-route-parser'
import { assembleSystemGraph, deriveServiceAndDatabaseNodes } from './service-db-heuristic'

function routeFile(overrides: Partial<ParsedRouteFile> & { filePath: string }): ParsedRouteFile {
  return { endpoints: [], mounts: [], imports: [], ...overrides }
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
