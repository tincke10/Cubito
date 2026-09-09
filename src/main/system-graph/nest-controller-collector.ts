import ts from 'typescript-compiler-api'
import type { ParsedEndpoint } from './framework-route-model'

const CONTROLLER_DECORATOR_NAME = 'Controller'
// W1: Get only — Post/Put/Patch/Delete/Options/Head/All land in a later wave.
const HTTP_METHOD_DECORATORS: ReadonlyMap<string, string> = new Map([['Get', 'GET']])

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

/** '' for absent/'/'; otherwise a leading-slash, no-trailing-slash path segment. */
function normalizePathSegment(raw: string): string {
  if (raw === '' || raw === '/') {
    return ''
  }
  const withLeadingSlash = raw.startsWith('/') ? raw : `/${raw}`
  return withLeadingSlash.endsWith('/') ? withLeadingSlash.slice(0, -1) : withLeadingSlash
}

// IMPORTANT: an absent @Controller() arg means '' (no prefix), not <dynamic> — never delegate
// this zero-arg case to route-call-ast's resolvePathArg, which conflates absent with dynamic.
function controllerPrefix(decorator: ts.Decorator): string {
  const arg = decoratorArg(decorator)
  return arg && ts.isStringLiteralLike(arg) ? normalizePathSegment(arg.text) : ''
}

/** Joins a controller prefix with a method decorator's own path arg; an absent method arg
 * resolves to the prefix itself (or '/' when the prefix is also empty). */
function methodEndpointPath(prefix: string, decorator: ts.Decorator): string {
  const arg = decoratorArg(decorator)
  if (!arg) {
    return prefix === '' ? '/' : prefix
  }
  const methodPath = ts.isStringLiteralLike(arg) ? normalizePathSegment(arg.text) : ''
  const combined = prefix + methodPath
  return combined === '' ? '/' : combined
}

function collectControllerEndpoints(
  controller: ts.ClassDeclaration,
  prefix: string
): ParsedEndpoint[] {
  const routerLocalName = controller.name?.text ?? null
  const endpoints: ParsedEndpoint[] = []
  for (const member of controller.members) {
    if (!ts.isMethodDeclaration(member)) {
      continue
    }
    for (const [name, httpMethod] of HTTP_METHOD_DECORATORS) {
      const decorator = findDecorator(member, name)
      if (decorator) {
        endpoints.push({
          method: httpMethod,
          path: methodEndpointPath(prefix, decorator),
          routerLocalName
        })
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
        endpoints.push(...collectControllerEndpoints(node, controllerPrefix(decorator)))
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return endpoints
}
