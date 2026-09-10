import type {
  ParsedEndpoint,
  ParsedImport,
  ParsedRouteFile,
  ParsedRouterMount
} from './framework-route-model'
import { composeMountPrefixes, resolveRelativeModule } from './route-mount-composition'
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

const SERVICE_NODE_CAP = 24

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

/** Immediate module name for grouping: last path segment, collapsing a bare 'index' to its dir. */
function moduleNameFromSpecifier(spec: string): string {
  const segments = spec.split('/').filter((seg) => seg.length > 0 && seg !== '.' && seg !== '..')
  if (segments.length === 0) {
    return spec
  }
  const last = segments.at(-1) as string
  return last === 'index' && segments.length > 1 ? (segments.at(-2) as string) : last
}

/** True when `file` has a relative import that itself resolves to a file with endpoints —
 * i.e. `file` is a wiring/descriptor file (e.g. a Nest `@Module()` file with no decorator of
 * its own) that references a route/controller file, rather than a data/service dependency.
 * One level deep only: enough to clear an entry file's import of such a wiring file (main.ts
 * -> app.module.ts -> users.controller.ts) without recursing into arbitrary import chains. */
function wiresRouteModule(
  file: ParsedRouteFile,
  filesByPath: ReadonlyMap<string, ParsedRouteFile>,
  knownFilePaths: ReadonlySet<string>
): boolean {
  return file.imports.some((imp) => {
    if (!imp.isRelative) {
      return false
    }
    const resolvedPath = resolveRelativeModule(file.filePath, imp.moduleSpecifier, knownFilePaths)
    const targetFile = resolvedPath ? filesByPath.get(resolvedPath) : undefined
    return !!targetFile && targetFile.endpoints.length > 0
  })
}

/** A relative import is excluded from service-node consideration when it's clearly a route
 * module, not a data/service dependency: its local binding is used as a same-file mount
 * target (covers a mount recorded with no literal prefix — never in `file.mounts` at all —
 * as well as one that is), it resolves (route-mount-composition.ts's own resolver, so this
 * never drifts from what a cross-file mount can actually reach) to a parsed file that itself
 * declares endpoints — the shape every router/plugin file has and a service file doesn't —,
 * carries a parsed Nest `moduleDescriptor` (any `@Module(...)` file is always wiring, even a
 * pure grouping module with zero endpoints and zero imports of its own, e.g. a RouterModule.
 * register target — more robust than the one-level-deep import walk below), or that file is
 * itself wiring for a route/controller file one level further in (D_v4-4). */
function isRouteModuleImport(
  file: ParsedRouteFile,
  imp: ParsedImport,
  filesByPath: ReadonlyMap<string, ParsedRouteFile>,
  knownFilePaths: ReadonlySet<string>
): boolean {
  const boundLocalNames = new Set((imp.bindings ?? []).map((b) => b.localName))
  if (file.mounts.some((m) => boundLocalNames.has(m.routerLocalName))) {
    return true
  }
  const resolvedPath = resolveRelativeModule(file.filePath, imp.moduleSpecifier, knownFilePaths)
  const targetFile = resolvedPath ? filesByPath.get(resolvedPath) : undefined
  if (!targetFile) {
    return false
  }
  return (
    targetFile.endpoints.length > 0 ||
    targetFile.moduleDescriptor !== undefined ||
    wiresRouteModule(targetFile, filesByPath, knownFilePaths)
  )
}

function collectServiceModuleNames(routeFiles: readonly ParsedRouteFile[]): string[] {
  const filesByPath = new Map(routeFiles.map((f) => [f.filePath, f]))
  const knownFilePaths = new Set(filesByPath.keys())
  const seen = new Set<string>()
  const ordered: string[] = []
  for (const file of routeFiles) {
    for (const imp of file.imports) {
      if (!imp.isRelative || isRouteModuleImport(file, imp, filesByPath, knownFilePaths)) {
        continue
      }
      const name = moduleNameFromSpecifier(imp.moduleSpecifier)
      if (!seen.has(name)) {
        seen.add(name)
        ordered.push(name)
      }
    }
  }
  return ordered.slice(0, SERVICE_NODE_CAP)
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

export function assembleSystemGraph(input: {
  routeFiles: ParsedRouteFile[]
  packageDependencies: string[]
}): EngineSystemGraph {
  const nodes = new Map<string, EngineSystemNode>()
  const edges: EngineSystemEdge[] = []
  const crossFileMounts = composeMountPrefixes(input.routeFiles)

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
      const composedPath =
        crossFilePrefix !== undefined
          ? crossFilePrefix + endpoint.path
          : composeEndpointPath(endpoint, file.mounts)
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
