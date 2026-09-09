import ts from 'typescript-compiler-api'
import type { ParsedImport } from './framework-route-model'

export const DYNAMIC_PATH = '<dynamic>'
export const HTTP_ROUTE_METHODS = new Set([
  'get',
  'post',
  'put',
  'delete',
  'patch',
  'options',
  'head',
  'all'
])

/** Resolves a call argument to a URL-space path string, degrading anything non-literal.
 * isStringLiteralLike covers string literals and no-substitution templates; a template
 * WITH substitutions is a TemplateExpression, which correctly falls through to dynamic. */
export function resolvePathArg(arg: ts.Expression | undefined): string {
  if (arg && ts.isStringLiteralLike(arg)) {
    return arg.text
  }
  return DYNAMIC_PATH
}

/** const x = someIdentifier() — the shared, name-agnostic instance-creation shape used by
 * both Express (app/router locals) and Fastify (server instance / plugin-function locals). */
export function isBareIdentifierCall(node: ts.Expression): boolean {
  return ts.isCallExpression(node) && ts.isIdentifier(node.expression)
}

export function calleeParts(
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

export function collectImports(sourceFile: ts.SourceFile): ParsedImport[] {
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
