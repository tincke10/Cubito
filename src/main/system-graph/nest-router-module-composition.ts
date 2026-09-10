import type { ParsedRouteFile } from './framework-route-model'
import { normalizePathSegment } from './nest-controller-collector'
import type { RouterModuleRoute } from './nest-router-module-registration'
import { DYNAMIC_PATH } from './route-call-ast'
import { resolveRelativeModule } from './route-mount-composition'

function findImportModuleSpecifier(file: ParsedRouteFile, localName: string): string | null {
  for (const imp of file.imports) {
    if (imp.bindings?.some((b) => b.localName === localName)) {
      return imp.moduleSpecifier
    }
  }
  return null
}

/** Resolves an identifier local to `fromFile` to the file it's imported from. Reuses
 * route-mount-composition.ts's own resolver so this never drifts from what a cross-file mount
 * can actually reach. */
function resolveImportedFile(
  fromFile: ParsedRouteFile,
  localName: string,
  filesByPath: ReadonlyMap<string, ParsedRouteFile>,
  knownFilePaths: ReadonlySet<string>
): ParsedRouteFile | null {
  const spec = findImportModuleSpecifier(fromFile, localName)
  if (!spec) {
    return null
  }
  const resolvedPath = resolveRelativeModule(fromFile.filePath, spec, knownFilePaths)
  return resolvedPath ? (filesByPath.get(resolvedPath) ?? null) : null
}

/** A literal segment gets the usual leading-slash treatment; the dynamic-path marker stays raw
 * (mirrors nest-controller-collector.ts, which never normalizes DYNAMIC_PATH either). */
function normalizeRouteSegment(path: string): string {
  return path === DYNAMIC_PATH ? path : normalizePathSegment(path)
}

/** Walks one RouterModule.register route (and its children) starting from `ownerFile` — the
 * file containing the register call, which every `module:`/`controllers:` identifier in the
 * tree must be imported into (real Nest usage always writes the whole tree in one file). */
function walkRoute(
  route: RouterModuleRoute,
  ownerFile: ParsedRouteFile,
  prefix: string,
  filesByPath: ReadonlyMap<string, ParsedRouteFile>,
  knownFilePaths: ReadonlySet<string>,
  visited: ReadonlySet<string>,
  result: Map<string, Map<string, string>>
): void {
  const moduleFile = resolveImportedFile(
    ownerFile,
    route.moduleLocalName,
    filesByPath,
    knownFilePaths
  )
  if (!moduleFile || visited.has(moduleFile.filePath)) {
    return // unresolved module identifier, or already visited on this branch (cycle guard)
  }
  const composedPrefix = prefix + normalizeRouteSegment(route.path)
  const nextVisited = new Set(visited)
  nextVisited.add(moduleFile.filePath)

  for (const controllerLocalName of moduleFile.moduleDescriptor?.controllers ?? []) {
    const controllerFile = resolveImportedFile(
      moduleFile,
      controllerLocalName,
      filesByPath,
      knownFilePaths
    )
    if (!controllerFile) {
      continue // controller identifier not resolvable to a known file — dropped
    }
    let perFile = result.get(controllerFile.filePath)
    if (!perFile) {
      perFile = new Map()
      result.set(controllerFile.filePath, perFile)
    }
    perFile.set(controllerLocalName, composedPrefix)
  }

  for (const child of route.children) {
    walkRoute(child, ownerFile, composedPrefix, filesByPath, knownFilePaths, nextVisited, result)
  }
}

/** Composes RouterModule.register path prefixes across nest module files — mirrors
 * route-mount-composition.ts's cross-file resolution pattern, but walks a module tree instead of
 * a mount chain. Maps each controller's local name (as declared in a `@Module({ controllers })`)
 * to its full router-module prefix, keyed by the CONTROLLER file's path — the same shape
 * service-db-heuristic.ts already consumes from composeMountPrefixes. */
export function composeRouterModulePrefixes(
  files: readonly ParsedRouteFile[]
): Map<string, Map<string, string>> {
  const filesByPath = new Map(files.map((f) => [f.filePath, f]))
  const knownFilePaths = new Set(filesByPath.keys())
  const result = new Map<string, Map<string, string>>()

  for (const file of files) {
    for (const route of file.moduleDescriptor?.routerRoutes ?? []) {
      walkRoute(route, file, '', filesByPath, knownFilePaths, new Set(), result)
    }
  }
  return result
}
