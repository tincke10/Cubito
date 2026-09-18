import type { ParsedEndpoint, ParsedRouteFile, ParsedRouterMount } from './framework-route-model'
import { composeRouterModulePrefixes } from './nest-router-module-composition'
import { composeMountPrefixes } from './route-mount-composition'
import {
  collectServiceModuleNames,
  moduleNameFromSpecifier
} from './service-module-name-resolution'
import type { EngineSystemEdge, EngineSystemGraph, EngineSystemNode } from './system-graph-model'

// Why (D6, light heuristic): dep name -> concrete database engine label, deduped by label so
// e.g. pg+postgres collapse to one node instead of one per package.
const CONCRETE_DB_LABELS: ReadonlyMap<string, string> = new Map([
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
  ['mssql', 'SQL Server'],
  ['cassandra-driver', 'Cassandra']
])

// Why: an ORM/query-builder doesn't name a concrete engine on its own — only surfaced when
// no concrete driver is also present, so e.g. typeorm+pg collapses to PostgreSQL, not both.
const GENERIC_DB_LABELS: ReadonlyMap<string, string> = new Map([
  ['@prisma/client', 'Prisma'],
  ['prisma', 'Prisma'],
  ['typeorm', 'SQL Database'],
  ['sequelize', 'SQL Database'],
  ['knex', 'SQL Database'],
  ['drizzle-orm', 'SQL Database']
])

function detectDatabaseLabels(packageDependencies: readonly string[]): string[] {
  const concreteLabels = new Set<string>()
  const genericLabels = new Set<string>()
  for (const dep of packageDependencies) {
    const concrete = CONCRETE_DB_LABELS.get(dep)
    if (concrete) {
      concreteLabels.add(concrete)
      continue
    }
    const generic = GENERIC_DB_LABELS.get(dep)
    if (generic) {
      genericLabels.add(generic)
    }
  }
  return [...(concreteLabels.size > 0 ? concreteLabels : genericLabels)]
}

/** Walks the mount chain (routerLocalName -> parentLocalName) to prepend prefixes, root-first. */
function composeEndpointPath(
  endpoint: ParsedEndpoint,
  mounts: readonly ParsedRouterMount[]
): string {
  if (!endpoint.routerLocalName) {
    return endpoint.path
  }
  const prefixes: string[] = []
  const visited = new Set<string>()
  let current: string | null = endpoint.routerLocalName
  while (current && !visited.has(current)) {
    visited.add(current)
    const mount = mounts.find((m) => m.routerLocalName === current)
    if (!mount) {
      break
    }
    prefixes.unshift(mount.prefix)
    current = mount.parentLocalName
  }
  return prefixes.join('') + endpoint.path
}

export function deriveServiceAndDatabaseNodes(input: {
  routeFiles: ParsedRouteFile[]
  packageDependencies: string[]
}): {
  serviceNodes: EngineSystemNode[]
  databaseNodes: EngineSystemNode[]
  edges: EngineSystemEdge[]
} {
  const databaseNodes: EngineSystemNode[] = detectDatabaseLabels(input.packageDependencies).map(
    (label) => ({ id: `database:${label}`, kind: 'database', label, diff: null })
  )

  const serviceNames = collectServiceModuleNames(input.routeFiles)
  const serviceNameSet = new Set(serviceNames)
  const serviceNodes: EngineSystemNode[] = serviceNames.map((name) => ({
    id: `service:${name}`,
    kind: 'service',
    label: name,
    diff: null
  }))

  const edges: EngineSystemEdge[] = []
  const flowSeen = new Set<string>()
  for (const file of input.routeFiles) {
    if (file.endpoints.length === 0) {
      continue // no router node will exist for this file — nothing to hang a flow edge on
    }
    const routerId = `router:${file.filePath}`
    for (const imp of file.imports) {
      if (!imp.isRelative) {
        continue
      }
      const name = moduleNameFromSpecifier(imp.moduleSpecifier)
      if (!serviceNameSet.has(name)) {
        continue // capped out of serviceNodes
      }
      const key = `${routerId}->${name}`
      if (flowSeen.has(key)) {
        continue
      }
      flowSeen.add(key)
      edges.push({ from: routerId, to: `service:${name}`, kind: 'flow' })
    }
  }

  // Light heuristic (D6): every detected service assumed to reach every detected database —
  // no per-call resolution, just a faint "this app likely touches storage" signal.
  for (const service of serviceNodes) {
    for (const db of databaseNodes) {
      edges.push({ from: service.id, to: db.id, kind: 'faint' })
    }
  }

  return { serviceNodes, databaseNodes, edges }
}

/** Nest-only prefix join: an empty prefix is a no-op; a bare '/' path collapses to the prefix
 * alone (avoids a trailing slash, e.g. an empty-@Controller() root under a router-module
 * prefix); otherwise concatenate, inserting a separating '/' only when `path` doesn't already
 * carry one — the raw dynamic-path marker never does. Applies uniformly to the globalPrefix and
 * routerModulePrefix layers, and is a no-op for every express/fastify file (empty prefix). */
export function appendNestPrefix(prefix: string, path: string): string {
  if (prefix === '') {
    return path
  }
  if (path === '/') {
    return prefix
  }
  return path.startsWith('/') ? prefix + path : `${prefix}/${path}`
}

export function assembleSystemGraph(input: {
  routeFiles: ParsedRouteFile[]
  packageDependencies: string[]
}): EngineSystemGraph {
  const nodes = new Map<string, EngineSystemNode>()
  const edges: EngineSystemEdge[] = []
  const crossFileMounts = composeMountPrefixes(input.routeFiles)
  const routerModulePrefixes = composeRouterModulePrefixes(input.routeFiles)
  const globalPrefix =
    input.routeFiles.find((f) => f.globalPrefix !== undefined)?.globalPrefix ?? ''

  for (const file of input.routeFiles) {
    if (file.endpoints.length === 0) {
      continue
    }
    const routerId = `router:${file.filePath}`
    nodes.set(routerId, { id: routerId, kind: 'router', label: file.filePath, diff: null })

    file.endpoints.forEach((endpoint, index) => {
      // A cross-file mount (import/export-resolved) is consulted first; a router local
      // never reached by one falls back to the original same-file mount-chain walk.
      const crossFilePrefix = endpoint.routerLocalName
        ? crossFileMounts.get(file.filePath)?.get(endpoint.routerLocalName)
        : undefined
      const basePath =
        crossFilePrefix !== undefined
          ? crossFilePrefix + endpoint.path
          : composeEndpointPath(endpoint, file.mounts)
      // Nest-only outer layers, both no-ops for express/fastify: a RouterModule.register prefix
      // applies first, then the graph-wide app.setGlobalPrefix(...) prefix applies over that.
      const routerModulePrefix = endpoint.routerLocalName
        ? (routerModulePrefixes.get(file.filePath)?.get(endpoint.routerLocalName) ?? '')
        : ''
      const composedPath = appendNestPrefix(
        globalPrefix,
        appendNestPrefix(routerModulePrefix, basePath)
      )
      const endpointId = `endpoint:${file.filePath}#${index}`
      nodes.set(endpointId, {
        id: endpointId,
        kind: 'endpoint',
        label: `${endpoint.method} ${composedPath}`,
        method: endpoint.method,
        path: composedPath,
        diff: null
      })
      edges.push({ from: routerId, to: endpointId, kind: 'normal' })
    })
  }

  const {
    serviceNodes,
    databaseNodes,
    edges: heuristicEdges
  } = deriveServiceAndDatabaseNodes(input)
  for (const node of [...serviceNodes, ...databaseNodes]) {
    nodes.set(node.id, node)
  }
  edges.push(...heuristicEdges)

  return { nodes, edges }
}
