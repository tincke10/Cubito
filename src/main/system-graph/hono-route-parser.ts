import ts from 'typescript-compiler-api'
import type {
  FrameworkRouteParser,
  ParsedEndpoint,
  ParsedExport,
  ParsedRouteFile
} from './framework-route-model'
import { collectInstanceEndpointsAndMounts } from './instance-route-mount-collector'
import {
  HTTP_ROUTE_METHODS,
  collectExports,
  collectImports,
  collectNamespaceImportLocalNames,
  collectRelativeImportLocalNames,
  isNewExpressionOf,
  resolvePathArg,
  unwrapFluentChain
} from './route-call-ast'

const DEFAULT_HONO_EXPORT_LOCAL = '__defaultHonoExport'

function emptyResult(filePath: string): ParsedRouteFile {
  return { filePath, endpoints: [], mounts: [], imports: [], exports: [] }
}

function isNewHono(expr: ts.Expression): boolean {
  return isNewExpressionOf(expr, 'Hono')
}

/** Converts a fluent chain's harvested calls into endpoints, on the given router local. Any
 * non-HTTP-verb call (e.g. .basePath()) is silently dropped — the v1 approximation for
 * unsupported chain shapes: still parses, just without applying that call's effect. */
function chainCallsToEndpoints(
  calls: { methodName: string; args: ts.NodeArray<ts.Expression> }[],
  routerLocalName: string
): ParsedEndpoint[] {
  return calls
    .filter((call) => HTTP_ROUTE_METHODS.has(call.methodName))
    .map((call) => ({
      method: call.methodName.toUpperCase(),
      path: resolvePathArg(call.args[0]),
      routerLocalName
    }))
}

/** Tracks locals bound to a `new Hono()`-rooted fluent chain (possibly zero-length), and
 * harvests any HTTP-verb calls living inside that initializer expression itself — calls a
 * normal calleeParts-based body walk can never reach, since their receiver is a call/new
 * expression, not a bare identifier. */
function collectHonoInstanceLocals(sourceFile: ts.SourceFile): {
  instanceLocals: Set<string>
  chainEndpoints: ParsedEndpoint[]
} {
  const instanceLocals = new Set<string>()
  const chainEndpoints: ParsedEndpoint[] = []
  const visit = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      const calls = unwrapFluentChain(node.initializer, isNewHono)
      if (calls !== null) {
        instanceLocals.add(node.name.text)
        chainEndpoints.push(...chainCallsToEndpoints(calls, node.name.text))
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return { instanceLocals, chainEndpoints }
}

/** `export default new Hono().get(...)` — no named local at all. Synthesizes an internal local
 * name so cross-file mount resolution (route-mount-composition.ts) can still key off it, exactly
 * like any other named export — that file needs no changes to support this. */
function collectDefaultExportChain(sourceFile: ts.SourceFile): {
  endpoints: ParsedEndpoint[]
  exportEntry: ParsedExport | null
} {
  for (const statement of sourceFile.statements) {
    if (!ts.isExportAssignment(statement) || statement.isExportEquals) {
      continue
    }
    const calls = unwrapFluentChain(statement.expression, isNewHono)
    if (calls === null) {
      continue
    }
    return {
      endpoints: chainCallsToEndpoints(calls, DEFAULT_HONO_EXPORT_LOCAL),
      exportEntry: { localName: DEFAULT_HONO_EXPORT_LOCAL, exportedName: 'default' }
    }
  }
  return { endpoints: [], exportEntry: null }
}

/** Pure Hono/TS route extraction over an AST; never throws — invalid input yields a partial
 * result. Only `.route()` mounts a child instance under a prefix — `.use()` is middleware-only
 * for Hono and never creates a mount (the opposite of Express's convention). */
export function parseHonoRoutes(source: string, filePath: string): ParsedRouteFile {
  try {
    const sourceFile = ts.createSourceFile(
      filePath,
      source,
      ts.ScriptTarget.Latest,
      /* setParentNodes */ true,
      ts.ScriptKind.TS
    )
    const { instanceLocals, chainEndpoints } = collectHonoInstanceLocals(sourceFile)
    const relativeImportLocalNames = collectRelativeImportLocalNames(sourceFile)
    const namespaceImportLocalNames = collectNamespaceImportLocalNames(sourceFile)
    const { endpoints, mounts, syntheticImports } = collectInstanceEndpointsAndMounts(
      sourceFile,
      instanceLocals,
      relativeImportLocalNames,
      namespaceImportLocalNames,
      { mountMethodName: 'route', supportsRouteChain: false }
    )
    const { endpoints: defaultExportEndpoints, exportEntry } = collectDefaultExportChain(sourceFile)
    const imports = [...collectImports(sourceFile), ...syntheticImports]
    const exports = collectExports(sourceFile)
    if (exportEntry) {
      exports.push(exportEntry)
    }
    return {
      filePath,
      endpoints: [...chainEndpoints, ...endpoints, ...defaultExportEndpoints],
      mounts,
      imports,
      exports
    }
  } catch {
    return emptyResult(filePath)
  }
}

export const honoRouteParser: FrameworkRouteParser = {
  framework: 'hono',
  parse: parseHonoRoutes
}
