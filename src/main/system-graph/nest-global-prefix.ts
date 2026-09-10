import ts from 'typescript-compiler-api'
import { normalizePathSegment } from './nest-controller-collector'
import { DYNAMIC_PATH } from './route-call-ast'

const SET_GLOBAL_PREFIX_METHOD = 'setGlobalPrefix'

/** Finds the first `<ident>.setGlobalPrefix(prefix, ...)` call in a Nest source file (normally
 * main.ts); the optional second `exclude` arg is ignored — known approximation, every endpoint
 * gets the prefix regardless of what Nest would actually exclude. undefined when no call exists. */
export function collectGlobalPrefix(sourceFile: ts.SourceFile): string | undefined {
  let prefix: string | undefined
  const visit = (node: ts.Node): void => {
    if (prefix !== undefined) {
      return
    }
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      ts.isIdentifier(node.expression.name) &&
      node.expression.name.text === SET_GLOBAL_PREFIX_METHOD
    ) {
      const arg = node.arguments[0]
      prefix = arg && ts.isStringLiteralLike(arg) ? normalizePathSegment(arg.text) : DYNAMIC_PATH
      return
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return prefix
}
