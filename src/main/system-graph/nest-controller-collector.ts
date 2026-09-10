import ts from 'typescript-compiler-api'
import type { ParsedEndpoint } from './framework-route-model'
import { DYNAMIC_PATH, stringLiteralValues } from './route-call-ast'

const CONTROLLER_DECORATOR_NAME = 'Controller'
const HTTP_METHOD_DECORATORS: ReadonlyMap<string, string> = new Map([
  ['Get', 'GET'],
  ['Post', 'POST'],
  ['Put', 'PUT'],
  ['Patch', 'PATCH'],
  ['Delete', 'DELETE'],
  ['Options', 'OPTIONS'],
  ['Head', 'HEAD'],
  ['All', 'ALL']
])

function decoratorName(decorator: ts.Decorator): string | null {
  const callee = ts.isCallExpression(decorator.expression)
    ? decorator.expression.expression
    : decorator.expression
  return ts.isIdentifier(callee) ? callee.text : null
}

function decoratorArg(decorator: ts.Decorator): ts.Expression | undefined {
  return ts.isCallExpression(decorator.expression) ? decorator.expression.arguments[0] : undefined
}

function findDecorator(node: ts.Node, name: string): ts.Decorator | undefined {
  if (!ts.canHaveDecorators(node)) {
    return undefined
  }
  return (ts.getDecorators(node) ?? []).find((d) => decoratorName(d) === name)
}

/** '' for absent/'/'; otherwise a leading-slash, no-trailing-slash path segment. Exported for
 * nest-global-prefix.ts, which needs the same normalization for setGlobalPrefix's arg. */
export function normalizePathSegment(raw: string): string {
  if (raw === '' || raw === '/') {
    return ''
  }
  const withLeadingSlash = raw.startsWith('/') ? raw : `/${raw}`
  return withLeadingSlash.endsWith('/') ? withLeadingSlash.slice(0, -1) : withLeadingSlash
}

/** A string literal or array-of-string-literals arg -> its normalized path segment(s);
 * anything else (identifier, non-literal expression) degrades to a single dynamic-path marker. */
function resolvePathValues(arg: ts.Expression): string[] {
  const literalValues = stringLiteralValues(arg)
  return literalValues.length > 0 ? literalValues.map(normalizePathSegment) : [DYNAMIC_PATH]
}

function objectLiteralPathProperty(
  arg: ts.ObjectLiteralExpression
): ts.PropertyAssignment | undefined {
  return arg.properties.find(
    (p): p is ts.PropertyAssignment =>
      ts.isPropertyAssignment(p) && ts.isIdentifier(p.name) && p.name.text === 'path'
  )
}

// IMPORTANT: an absent @Controller() arg means '' (no prefix), not <dynamic> — never delegate
// this zero-arg case to route-call-ast's resolvePathArg, which conflates absent with dynamic.
function controllerPrefixes(decorator: ts.Decorator): string[] {
  const arg = decoratorArg(decorator)
  if (!arg) {
    return ['']
  }
  if (ts.isObjectLiteralExpression(arg)) {
    const pathProp = objectLiteralPathProperty(arg)
    return pathProp ? resolvePathValues(pathProp.initializer) : ['']
  }
  return resolvePathValues(arg)
}

/** Joins a controller prefix with a method decorator's own path arg(s); an absent method arg
 * resolves to the prefix itself (or '/' when the prefix is also empty) — the ONLY case not
 * routed through resolvePathValues, since absent must not become <dynamic>. */
function methodEndpointPaths(prefix: string, decorator: ts.Decorator): string[] {
  const arg = decoratorArg(decorator)
  if (!arg) {
    return [prefix === '' ? '/' : prefix]
  }
  return resolvePathValues(arg).map((methodPath) => {
    const combined = prefix + methodPath
    return combined === '' ? '/' : combined
  })
}

function collectControllerEndpoints(
  controller: ts.ClassDeclaration,
  prefixes: readonly string[]
): ParsedEndpoint[] {
  const routerLocalName = controller.name?.text ?? null
  const endpoints: ParsedEndpoint[] = []
  for (const member of controller.members) {
    if (!ts.isMethodDeclaration(member)) {
      continue
    }
    for (const [name, httpMethod] of HTTP_METHOD_DECORATORS) {
      const decorator = findDecorator(member, name)
      if (!decorator) {
        continue
      }
      for (const prefix of prefixes) {
        for (const path of methodEndpointPaths(prefix, decorator)) {
          endpoints.push({ method: httpMethod, path, routerLocalName })
        }
      }
    }
  }
  return endpoints
}

/** Walks every `@Controller`-decorated class in a Nest source file, in source order — a file
 * with multiple controllers still yields one flat endpoint list (one router node per file). */
export function collectNestEndpoints(sourceFile: ts.SourceFile): ParsedEndpoint[] {
  const endpoints: ParsedEndpoint[] = []
  const visit = (node: ts.Node): void => {
    if (ts.isClassDeclaration(node)) {
      const decorator = findDecorator(node, CONTROLLER_DECORATOR_NAME)
      if (decorator) {
        endpoints.push(...collectControllerEndpoints(node, controllerPrefixes(decorator)))
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return endpoints
}
