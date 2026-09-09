import ts from 'typescript-compiler-api'
import type { ParsedEndpoint } from './framework-route-model'
import {
  HTTP_ROUTE_METHODS,
  calleeParts,
  resolvePathArg,
  stringLiteralValues
} from './route-call-ast'

/** Extracts one endpoint per method from a `.route({ method, url })` object-literal argument. */
function routeCallEndpoints(
  objectArg: ts.Expression | undefined,
  routerLocalName: string
): ParsedEndpoint[] {
  if (!objectArg || !ts.isObjectLiteralExpression(objectArg)) {
    return []
  }
  let methods: string[] = []
  let url: string | null = null
  for (const prop of objectArg.properties) {
    if (!ts.isPropertyAssignment(prop) || !ts.isIdentifier(prop.name)) {
      continue
    }
    if (prop.name.text === 'method') {
      methods = stringLiteralValues(prop.initializer)
    } else if (prop.name.text === 'url' && ts.isStringLiteralLike(prop.initializer)) {
      url = prop.initializer.text
    }
  }
  if (url === null) {
    return []
  }
  return methods.map((method) => ({
    method: method.toUpperCase(),
    path: url as string,
    routerLocalName
  }))
}

/** Collects verb + `.route()` endpoints for calls on any of `receiverNames`, walking `root`.
 * `labelFor` maps the matched receiver name to the ParsedEndpoint.routerLocalName — identity
 * for a plain instance, the enclosing plugin's own name for a plugin's first-parameter receiver. */
export function collectFastifyEndpoints(
  root: ts.Node,
  receiverNames: ReadonlySet<string>,
  labelFor: (receiverName: string) => string
): ParsedEndpoint[] {
  const endpoints: ParsedEndpoint[] = []
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const parts = calleeParts(node.expression)
      if (parts && receiverNames.has(parts.objectName)) {
        const label = labelFor(parts.objectName)
        if (HTTP_ROUTE_METHODS.has(parts.methodName)) {
          endpoints.push({
            method: parts.methodName.toUpperCase(),
            path: resolvePathArg(node.arguments[0]),
            routerLocalName: label
          })
        } else if (parts.methodName === 'route') {
          endpoints.push(...routeCallEndpoints(node.arguments[0], label))
        }
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(root)
  return endpoints
}
