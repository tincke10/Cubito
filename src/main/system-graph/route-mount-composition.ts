import { posix } from 'node:path'
import type { ParsedRouteFile, ParsedRouterMount } from './framework-route-model'

const RESOLUTION_SUFFIXES = ['', '.ts', '.tsx', '.js', '/index.ts', '/index.js']
const KEY_SEPARATOR = '\u0000'

type FileKey = string

function fileKey(filePath: string, localName: string): FileKey {
  return `${filePath}${KEY_SEPARATOR}${localName}`
}

function splitFileKey(key: FileKey): [filePath: string, localName: string] {
  const separatorIndex = key.lastIndexOf(KEY_SEPARATOR)
  return [key.slice(0, separatorIndex), key.slice(separatorIndex + 1)]
}

/** Resolves a relative import specifier against the known worktree file set — no fs access,
 * just candidate suffixes tried against the files this graph already has. Exported for
 * service-db-heuristic.ts, which reuses this same resolution to keep a mounted route module
 * out of the service heuristic instead of duplicating the lookup. */
export function resolveRelativeModule(
  fromFilePath: string,
  spec: string,
  knownFilePaths: ReadonlySet<string>
): string | null {
  if (!spec.startsWith('.')) {
    return null
  }
  const joined = posix.normalize(posix.join(posix.dirname(fromFilePath), spec))
  for (const suffix of RESOLUTION_SUFFIXES) {
    const candidate = joined + suffix
    if (knownFilePaths.has(candidate)) {
      return candidate
    }
  }
  return null
}

function findImportBinding(
  file: ParsedRouteFile,
  localName: string
): { moduleSpecifier: string; importedName: string } | null {
  for (const imp of file.imports) {
    const binding = imp.bindings?.find((b) => b.localName === localName)
    if (binding) {
      return { moduleSpecifier: imp.moduleSpecifier, importedName: binding.importedName }
    }
  }
  return null
}

type MountEdge = { sourceKey: FileKey; prefix: string; isCrossFile: boolean }

/** Resolves a mount's target identity: an import-bound routerLocalName crosses to the
 * exporting file's local name; otherwise it stays an intra-file target, same as before.
 * Returns null when the target can't be resolved (unresolved import/export) — the mount
 * contributes no edge, so the path it would have prefixed stays uncomposed. */
function resolveMountTarget(
  file: ParsedRouteFile,
  mount: ParsedRouterMount,
  filesByPath: ReadonlyMap<string, ParsedRouteFile>,
  knownFilePaths: ReadonlySet<string>
): { key: FileKey; isCrossFile: boolean } | null {
  const binding = findImportBinding(file, mount.routerLocalName)
  if (!binding) {
    return { key: fileKey(file.filePath, mount.routerLocalName), isCrossFile: false }
  }
  const resolvedPath = resolveRelativeModule(file.filePath, binding.moduleSpecifier, knownFilePaths)
  const targetFile = resolvedPath ? filesByPath.get(resolvedPath) : undefined
  const exportEntry = targetFile?.exports.find((e) => e.exportedName === binding.importedName)
  if (!resolvedPath || !targetFile || !exportEntry) {
    return null
  }
  return { key: fileKey(resolvedPath, exportEntry.localName), isCrossFile: true }
}

/** One incoming edge per target identity (first mount wins, matching the existing
 * intra-file lookup's Array.find order). */
function buildIncomingEdges(
  files: readonly ParsedRouteFile[],
  filesByPath: ReadonlyMap<string, ParsedRouteFile>,
  knownFilePaths: ReadonlySet<string>
): Map<FileKey, MountEdge> {
  const edges = new Map<FileKey, MountEdge>()
  for (const file of files) {
    for (const mount of file.mounts) {
      const target = resolveMountTarget(file, mount, filesByPath, knownFilePaths)
      if (!target || edges.has(target.key)) {
        continue
      }
      edges.set(target.key, {
        sourceKey: fileKey(file.filePath, mount.parentLocalName ?? ''),
        prefix: mount.prefix,
        isCrossFile: target.isCrossFile
      })
    }
  }
  return edges
}

function resolveKeyPrefix(
  key: FileKey,
  edges: ReadonlyMap<FileKey, MountEdge>,
  visited: Set<FileKey>
): { prefix: string; sawCrossFile: boolean } {
  if (visited.has(key)) {
    return { prefix: '', sawCrossFile: false } // cycle guard
  }
  visited.add(key)
  const edge = edges.get(key)
  if (!edge) {
    return { prefix: '', sawCrossFile: false }
  }
  const upstream = resolveKeyPrefix(edge.sourceKey, edges, visited)
  return {
    prefix: upstream.prefix + edge.prefix,
    sawCrossFile: upstream.sawCrossFile || edge.isCrossFile
  }
}

/** Composes endpoint-path prefixes across file boundaries via import/export bindings — e.g.
 * `index.ts` mounting a router imported from `routes/users.ts`, or a Fastify plugin registered
 * by its imported identifier (including an fp(...)-wrapped one, already unwrapped by the parser).
 *
 * Only returns entries whose resolution chain crosses at least one file boundary. A purely
 * intra-file mount chain — the only shape every pre-existing test exercises — yields no entry
 * here at all, so callers must still fall back to the original same-file composeEndpointPath
 * for those, guaranteeing identical output wherever no cross-file mount exists. */
export function composeMountPrefixes(
  files: readonly ParsedRouteFile[]
): Map<string, Map<string, string>> {
  const filesByPath = new Map(files.map((f) => [f.filePath, f]))
  const knownFilePaths = new Set(filesByPath.keys())
  const edges = buildIncomingEdges(files, filesByPath, knownFilePaths)

  const result = new Map<string, Map<string, string>>()
  for (const key of edges.keys()) {
    const { prefix, sawCrossFile } = resolveKeyPrefix(key, edges, new Set())
    if (!sawCrossFile) {
      continue
    }
    const [filePath, localName] = splitFileKey(key)
    let perFile = result.get(filePath)
    if (!perFile) {
      perFile = new Map()
      result.set(filePath, perFile)
    }
    perFile.set(localName, prefix)
  }
  return result
}
