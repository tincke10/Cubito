import ts from 'typescript-compiler-api'
import type { FrameworkRouteParser, ParsedEndpoint, ParsedRouteFile } from './framework-route-model'
import {
  HTTP_ROUTE_METHODS,
  calleeParts,
  collectImports,
  isBareIdentifierCall,
  resolvePathArg
} from './route-call-ast'

function emptyResult(filePath: string): ParsedRouteFile {
  return { filePath, endpoints: [], mounts: [], imports: [] }
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

function collectVerbEndpoints(
  sourceFile: ts.SourceFile,
  instanceLocals: ReadonlySet<string>
): ParsedEndpoint[] {
  const endpoints: ParsedEndpoint[] = []
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const parts = calleeParts(node.expression)
      if (
        parts &&
        instanceLocals.has(parts.objectName) &&
        HTTP_ROUTE_METHODS.has(parts.methodName)
      ) {
        endpoints.push({
          method: parts.methodName.toUpperCase(),
          path: resolvePathArg(node.arguments[0]),
          routerLocalName: parts.objectName
        })
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return endpoints
}

/** Pure Fastify/TS route extraction over an AST; never throws — invalid input yields a partial result.
 * v1 (minimal): verb calls only — .route()/.register() land in later waves. */
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
    const endpoints = collectVerbEndpoints(sourceFile, instanceLocals)
    const imports = collectImports(sourceFile)
    return { filePath, endpoints, mounts: [], imports }
  } catch {
    return emptyResult(filePath)
  }
}

export const fastifyRouteParser: FrameworkRouteParser = {
  framework: 'fastify',
  parse: parseFastifyRoutes
}
