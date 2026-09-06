import ts from 'typescript-compiler-api'

export type ParsedImport = { moduleSpecifier: string; isRelative: boolean }
export type ParsedEndpoint = { method: string; path: string; routerLocalName: string | null }
export type ParsedRouterMount = {
  prefix: string
  routerLocalName: string
  parentLocalName: string | null
}
export type ParsedRouteFile = {
  filePath: string
  endpoints: ParsedEndpoint[]
  mounts: ParsedRouterMount[]
  imports: ParsedImport[]
}

const DYNAMIC_PATH = '<dynamic>'
const ROUTE_METHODS = new Set(['get', 'post', 'put', 'delete', 'patch', 'options', 'head', 'all'])

function emptyResult(filePath: string): ParsedRouteFile {
  return { filePath, endpoints: [], mounts: [], imports: [] }
}

/** Resolves a call argument to a URL-space path string, degrading anything non-literal.
 * isStringLiteralLike covers string literals and no-substitution templates; a template
 * WITH substitutions is a TemplateExpression, which correctly falls through to dynamic. */
function resolvePathArg(arg: ts.Expression | undefined): string {
  if (arg && ts.isStringLiteralLike(arg)) {
    return arg.text
  }
  return DYNAMIC_PATH
}

function isRouterCreationCall(node: ts.Expression): boolean {
  // express() or express.Router()
  if (!ts.isCallExpression(node)) {
    return false
  }
  const callee = node.expression
  if (ts.isIdentifier(callee)) {
    return true // const app = express()
  }
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

function calleeParts(
  expr: ts.LeftHandSideExpression
): { objectName: string; methodName: string } | null {
  if (!ts.isPropertyAccessExpression(expr) || !ts.isIdentifier(expr.name)) {
    return null
  }
  if (!ts.isIdentifier(expr.expression)) {
    return null
  }
  return { objectName: expr.expression.text, methodName: expr.name.text }
}

function collectEndpointsAndMounts(
  sourceFile: ts.SourceFile,
  routerLocals: ReadonlySet<string>
): { endpoints: ParsedEndpoint[]; mounts: ParsedRouterMount[] } {
  const endpoints: ParsedEndpoint[] = []
  const mounts: ParsedRouterMount[] = []

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

    if (ROUTE_METHODS.has(methodName)) {
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

  const handleMount = (parentLocalName: string, node: ts.CallExpression): void => {
    const [prefixArg, targetArg] = node.arguments
    if (!prefixArg || !ts.isStringLiteralLike(prefixArg)) {
      return
    }
    if (!targetArg || !ts.isIdentifier(targetArg) || !routerLocals.has(targetArg.text)) {
      return
    }
    mounts.push({ prefix: prefixArg.text, routerLocalName: targetArg.text, parentLocalName })
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
      if (ROUTE_METHODS.has(methodName)) {
        endpoints.push({ method: methodName.toUpperCase(), path, routerLocalName })
      }
      current = callExpr.parent
    }
  }

  visit(sourceFile)
  return { endpoints, mounts }
}

function collectImports(sourceFile: ts.SourceFile): ParsedImport[] {
  const imports: ParsedImport[] = []
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement)) {
      continue
    }
    if (!ts.isStringLiteralLike(statement.moduleSpecifier)) {
      continue
    }
    const moduleSpecifier = statement.moduleSpecifier.text
    imports.push({ moduleSpecifier, isRelative: moduleSpecifier.startsWith('.') })
  }
  return imports
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
    const { endpoints, mounts } = collectEndpointsAndMounts(sourceFile, routerLocals)
    const imports = collectImports(sourceFile)
    return { filePath, endpoints, mounts, imports }
  } catch {
    return emptyResult(filePath)
  }
}
