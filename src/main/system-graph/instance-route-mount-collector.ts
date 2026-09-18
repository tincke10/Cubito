import ts from 'typescript-compiler-api'
import type { ParsedEndpoint, ParsedImport, ParsedRouterMount } from './framework-route-model'
import { resolveMountTargetArg } from './mount-target-resolution'
import { DYNAMIC_PATH, HTTP_ROUTE_METHODS, calleeParts, resolvePathArg } from './route-call-ast'

/** mountMethodName: the method that binds a child instance under a prefix (Express/Fastify's
 * 'use', Hono's 'route'). supportsRouteChain: whether `<local>.route(path).get().post()` is a
 * recognized endpoint-chain shape on top of the mount method (Express only). */
export type InstanceMountConfig = { mountMethodName: string; supportsRouteChain: boolean }

/** Parameterized instance-based endpoint/mount collector — walks every call on a known instance
 * local (`app`/`router`/etc.), shared by Express and Hono via `config`. */
export function collectInstanceEndpointsAndMounts(
  sourceFile: ts.SourceFile,
  instanceLocals: ReadonlySet<string>,
  relativeImportLocalNames: ReadonlySet<string>,
  namespaceImportLocalNames: ReadonlyMap<string, string>,
  config: InstanceMountConfig
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
    if (!instanceLocals.has(objectName)) {
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

    if (methodName === config.mountMethodName) {
      handleMount(objectName, node)
      return
    }

    if (config.supportsRouteChain && methodName === 'route') {
      handleRouteChain(objectName, node)
    }
  }

  // Accepts a locally-created instance OR one bound by a relative import — the latter is what
  // makes a cross-file mount (`app.use('/x', importedRouter)`) visible to route-mount-composition.ts.
  // A 1-arg call (`app.use(router)`) has no prefix argument at all — no mount, unchanged from
  // before; a 2-arg call with a non-literal prefix now renders DYNAMIC_PATH instead of dropping it.
  const handleMount = (parentLocalName: string, node: ts.CallExpression): void => {
    if (node.arguments.length < 2) {
      return
    }
    const [prefixArg, targetArg] = node.arguments
    const prefix = ts.isStringLiteralLike(prefixArg) ? prefixArg.text : DYNAMIC_PATH
    const target = resolveMountTargetArg(
      targetArg,
      namespaceImportLocalNames,
      nextSyntheticLocalName
    )
    if (target?.kind === 'identifier') {
      if (!instanceLocals.has(target.name) && !relativeImportLocalNames.has(target.name)) {
        return
      }
      mounts.push({ prefix, routerLocalName: target.name, parentLocalName })
    } else if (target?.kind === 'moduleBinding') {
      syntheticImports.push({
        moduleSpecifier: target.moduleSpecifier,
        isRelative: target.moduleSpecifier.startsWith('.'),
        bindings: [{ localName: target.localName, importedName: target.importedName }]
      })
      mounts.push({ prefix, routerLocalName: target.localName, parentLocalName })
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
