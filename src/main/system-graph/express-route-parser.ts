import ts from 'typescript-compiler-api'
import type {
  FrameworkRouteParser,
  ParsedEndpoint,
  ParsedImport,
  ParsedRouteFile,
  ParsedRouterMount
} from './framework-route-model'
import { resolveMountTargetArg } from './mount-target-resolution'
import {
  HTTP_ROUTE_METHODS,
  calleeParts,
  collectExports,
  collectImports,
  collectNamespaceImportLocalNames,
  collectRelativeImportLocalNames,
  isBareIdentifierCall,
  resolvePathArg
} from './route-call-ast'

// Backwards-compat re-exports: other files still import the route model from here.
export type {
  ParsedImport,
  ParsedEndpoint,
  ParsedRouterMount,
  ParsedRouteFile,
  FrameworkRouteParser
} from './framework-route-model'

function emptyResult(filePath: string): ParsedRouteFile {
  return { filePath, endpoints: [], mounts: [], imports: [], exports: [] }
}

function isRouterCreationCall(node: ts.Expression): boolean {
  // express() or express.Router()
  if (isBareIdentifierCall(node)) {
    return true // const app = express()
  }
  if (!ts.isCallExpression(node)) {
    return false
  }
  const callee = node.expression
  if (
    ts.isPropertyAccessExpression(callee) &&
    ts.isIdentifier(callee.name) &&
    callee.name.text === 'Router'
  ) {
    return true // const router = express.Router()
  }
  return false
}

/** Tracks identifiers bound to an express app/router instance (const x = express() | express.Router()). */
function collectRouterLocals(sourceFile: ts.SourceFile): Set<string> {
  const locals = new Set<string>()
  const visit = (node: ts.Node): void => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      isRouterCreationCall(node.initializer)
    ) {
      locals.add(node.name.text)
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return locals
}

function collectEndpointsAndMounts(
  sourceFile: ts.SourceFile,
  routerLocals: ReadonlySet<string>,
  relativeImportLocalNames: ReadonlySet<string>,
  namespaceImportLocalNames: ReadonlyMap<string, string>
): { endpoints: ParsedEndpoint[]; mounts: ParsedRouterMount[]; syntheticImports: ParsedImport[] } {
  const endpoints: ParsedEndpoint[] = []
  const mounts: ParsedRouterMount[] = []
  const syntheticImports: ParsedImport[] = []
  let syntheticCounter = 0
  const nextSyntheticLocalName = (): string => `__dynamicMountTarget${syntheticCounter++}`

  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      handleCall(node)
    }
    ts.forEachChild(node, visit)
  }

  const handleCall = (node: ts.CallExpression): void => {
    const parts = calleeParts(node.expression)
    if (!parts) {
      return
    }
    const { objectName, methodName } = parts
    if (!routerLocals.has(objectName)) {
      return
    }

    if (HTTP_ROUTE_METHODS.has(methodName)) {
      endpoints.push({
        method: methodName.toUpperCase(),
        path: resolvePathArg(node.arguments[0]),
        routerLocalName: objectName
      })
      return
    }

    if (methodName === 'use') {
      handleMount(objectName, node)
      return
    }

    if (methodName === 'route') {
      handleRouteChain(objectName, node)
    }
  }

  // Accepts a locally-created router OR one bound by a relative import — the latter is what
  // makes a cross-file mount (`app.use('/x', importedRouter)`) visible to route-mount-composition.ts.
  const handleMount = (parentLocalName: string, node: ts.CallExpression): void => {
    const [prefixArg, targetArg] = node.arguments
    if (!prefixArg || !ts.isStringLiteralLike(prefixArg)) {
      return
    }
    const target = resolveMountTargetArg(
      targetArg,
      namespaceImportLocalNames,
      nextSyntheticLocalName
    )
    if (target?.kind === 'identifier') {
      if (!routerLocals.has(target.name) && !relativeImportLocalNames.has(target.name)) {
        return
      }
      mounts.push({ prefix: prefixArg.text, routerLocalName: target.name, parentLocalName })
    } else if (target?.kind === 'moduleBinding') {
      syntheticImports.push({
        moduleSpecifier: target.moduleSpecifier,
        isRelative: target.moduleSpecifier.startsWith('.'),
        bindings: [{ localName: target.localName, importedName: target.importedName }]
      })
      mounts.push({ prefix: prefixArg.text, routerLocalName: target.localName, parentLocalName })
    }
  }

  // app.route('/x').get(h).post(h) — a chain of CallExpressions wrapping the base .route() call.
  const handleRouteChain = (routerLocalName: string, routeCall: ts.CallExpression): void => {
    const path = resolvePathArg(routeCall.arguments[0])
    let current: ts.Node = routeCall.parent
    while (
      ts.isPropertyAccessExpression(current) &&
      current.parent &&
      ts.isCallExpression(current.parent) &&
      current.parent.expression === current
    ) {
      const methodName = current.name.text
      const callExpr = current.parent
      if (HTTP_ROUTE_METHODS.has(methodName)) {
        endpoints.push({ method: methodName.toUpperCase(), path, routerLocalName })
      }
      current = callExpr.parent
    }
  }

  visit(sourceFile)
  return { endpoints, mounts, syntheticImports }
}

/** Pure Express/TS route extraction over an AST; never throws — invalid input yields a partial result. */
export function parseExpressRoutes(source: string, filePath: string): ParsedRouteFile {
  try {
    const sourceFile = ts.createSourceFile(
      filePath,
      source,
      ts.ScriptTarget.Latest,
      /* setParentNodes */ true,
      ts.ScriptKind.TS
    )
    const routerLocals = collectRouterLocals(sourceFile)
    const relativeImportLocalNames = collectRelativeImportLocalNames(sourceFile)
    const namespaceImportLocalNames = collectNamespaceImportLocalNames(sourceFile)
    const { endpoints, mounts, syntheticImports } = collectEndpointsAndMounts(
      sourceFile,
      routerLocals,
      relativeImportLocalNames,
      namespaceImportLocalNames
    )
    const imports = [...collectImports(sourceFile), ...syntheticImports]
    const exports = collectExports(sourceFile)
    return { filePath, endpoints, mounts, imports, exports }
  } catch {
    return emptyResult(filePath)
  }
}

export const expressRouteParser: FrameworkRouteParser = {
  framework: 'express',
  parse: parseExpressRoutes
}
