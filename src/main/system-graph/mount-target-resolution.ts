import ts from 'typescript-compiler-api'

export type MountTargetRef =
  | { kind: 'identifier'; name: string }
  | { kind: 'moduleBinding'; localName: string; moduleSpecifier: string; importedName: string }

/** `import('./x')` / `require('./x')` as a full call expression -> its module specifier, else null. */
function dynamicModuleSpecifier(node: ts.Expression): string | null {
  if (!ts.isCallExpression(node)) {
    return null
  }
  const isDynamicImport = node.expression.kind === ts.SyntaxKind.ImportKeyword
  const isRequireCall = ts.isIdentifier(node.expression) && node.expression.text === 'require'
  if (!isDynamicImport && !isRequireCall) {
    return null
  }
  const [arg] = node.arguments
  return arg && ts.isStringLiteralLike(arg) ? arg.text : null
}

/** Namespace-import property access (`ns.prop`) is not handled here yet — returns null,
 * left as a hook for a later wave that wires in namespaceImportLocalNames. */
function resolveDirectTarget(
  arg: ts.Expression,
  _namespaceImportLocalNames: ReadonlyMap<string, string>,
  syntheticLocalName: () => string
): MountTargetRef | null {
  const unwrapped = ts.isAwaitExpression(arg) ? arg.expression : arg
  if (ts.isIdentifier(unwrapped)) {
    return { kind: 'identifier', name: unwrapped.text }
  }
  const moduleSpecifier = dynamicModuleSpecifier(unwrapped)
  if (moduleSpecifier) {
    return {
      kind: 'moduleBinding',
      localName: syntheticLocalName(),
      moduleSpecifier,
      importedName: 'default'
    }
  }
  return null
}

/** Resolves a `.register(x)` / mount-target argument to what it refers to: a bare local
 * identifier, or a module binding synthesized from a dynamic `import()`/`require()` call or a
 * namespace-import property access (`ns.prop`) — unwrapping one level of wrapper call
 * (e.g. `fp(x)`) around any of those shapes. */
export function resolveMountTargetArg(
  arg: ts.Expression | undefined,
  namespaceImportLocalNames: ReadonlyMap<string, string>,
  syntheticLocalName: () => string
): MountTargetRef | null {
  if (!arg) {
    return null
  }
  const direct = resolveDirectTarget(arg, namespaceImportLocalNames, syntheticLocalName)
  if (direct) {
    return direct
  }
  if (ts.isCallExpression(arg) && arg.arguments.length === 1) {
    return resolveDirectTarget(arg.arguments[0], namespaceImportLocalNames, syntheticLocalName)
  }
  return null
}
