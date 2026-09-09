import ts from 'typescript-compiler-api'
import { collectFastifyEndpoints } from './fastify-endpoint-collector'
import { collectPluginRegistrations } from './fastify-plugin-registration'
import type { FrameworkRouteParser, ParsedRouteFile } from './framework-route-model'
import { collectExports, collectImports, isBareIdentifierCall } from './route-call-ast'

function emptyResult(filePath: string): ParsedRouteFile {
  return { filePath, endpoints: [], mounts: [], imports: [], exports: [] }
}

/** Tracks identifiers bound to a Fastify instance (const x = Fastify() | fastify()).
 * Same looseness as Express's router-local detection: no name check on the callee. */
function collectInstanceLocals(sourceFile: ts.SourceFile): Set<string> {
  const locals = new Set<string>()
  const visit = (node: ts.Node): void => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      isBareIdentifierCall(node.initializer)
    ) {
      locals.add(node.name.text)
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return locals
}

/** Pure Fastify/TS route extraction over an AST; never throws — invalid input yields a partial result.
 * v1: verb calls, .route({method,url}), and same-file .register(plugin,{prefix}) composition —
 * cross-file plugin registration lands in a later wave. */
export function parseFastifyRoutes(source: string, filePath: string): ParsedRouteFile {
  try {
    const sourceFile = ts.createSourceFile(
      filePath,
      source,
      ts.ScriptTarget.Latest,
      /* setParentNodes */ true,
      ts.ScriptKind.TS
    )
    const instanceLocals = collectInstanceLocals(sourceFile)
    const topLevelEndpoints = collectFastifyEndpoints(sourceFile, instanceLocals, (name) => name)
    const { mounts, pluginEndpoints, syntheticImports } = collectPluginRegistrations(
      sourceFile,
      instanceLocals
    )
    const imports = [...collectImports(sourceFile), ...syntheticImports]
    const exports = collectExports(sourceFile)
    return {
      filePath,
      endpoints: [...topLevelEndpoints, ...pluginEndpoints],
      mounts,
      imports,
      exports
    }
  } catch {
    return emptyResult(filePath)
  }
}

export const fastifyRouteParser: FrameworkRouteParser = {
  framework: 'fastify',
  parse: parseFastifyRoutes
}
