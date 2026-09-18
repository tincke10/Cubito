import type { ParsedImport, ParsedRouteFile } from './framework-route-model'
import { resolveRelativeModule } from './route-mount-composition'

const SERVICE_NODE_CAP = 24

/** Immediate module name for grouping: last path segment, collapsing a bare 'index' to its dir. */
export function moduleNameFromSpecifier(spec: string): string {
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

/** Distinct service-module names from every route file's relative imports, excluding anything
 * that's itself a route/wiring module (D_v4-4), capped and ordered first-seen. */
export function collectServiceModuleNames(routeFiles: readonly ParsedRouteFile[]): string[] {
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
