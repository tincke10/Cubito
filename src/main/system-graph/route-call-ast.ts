import ts from 'typescript-compiler-api'
import type { ParsedExport, ParsedImport, ParsedImportBinding } from './framework-route-model'

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

/** Extracts every local name an import clause binds, and the name it was imported as. */
function collectImportBindings(clause: ts.ImportClause | undefined): ParsedImportBinding[] {
  if (!clause) {
    return []
  }
  const bindings: ParsedImportBinding[] = []
  if (clause.name) {
    bindings.push({ localName: clause.name.text, importedName: 'default' })
  }
  if (clause.namedBindings) {
    if (ts.isNamespaceImport(clause.namedBindings)) {
      bindings.push({ localName: clause.namedBindings.name.text, importedName: '*' })
    } else if (ts.isNamedImports(clause.namedBindings)) {
      for (const element of clause.namedBindings.elements) {
        const importedName = (element.propertyName ?? element.name).text
        bindings.push({ localName: element.name.text, importedName })
      }
    }
  }
  return bindings
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
    imports.push({
      moduleSpecifier,
      isRelative: moduleSpecifier.startsWith('.'),
      bindings: collectImportBindings(statement.importClause)
    })
  }
  return imports
}

/** Local names bound by a relative (same-project) import — lets a mount/register-target
 * check recognize a router/plugin declared in another file, not only one created locally. */
export function collectRelativeImportLocalNames(sourceFile: ts.SourceFile): Set<string> {
  const names = new Set<string>()
  for (const imp of collectImports(sourceFile)) {
    if (!imp.isRelative) {
      continue
    }
    for (const binding of imp.bindings ?? []) {
      names.add(binding.localName)
    }
  }
  return names
}

/** Local name -> module specifier for every relative namespace import (`import * as ns from
 * './x'`) — lets a mount-target resolver treat `ns.prop` as a property access into a known file. */
export function collectNamespaceImportLocalNames(sourceFile: ts.SourceFile): Map<string, string> {
  const names = new Map<string, string>()
  for (const imp of collectImports(sourceFile)) {
    if (!imp.isRelative) {
      continue
    }
    for (const binding of imp.bindings ?? []) {
      if (binding.importedName === '*') {
        names.set(binding.localName, imp.moduleSpecifier)
      }
    }
  }
  return names
}

function hasModifier(node: ts.Node, kind: ts.SyntaxKind): boolean {
  return ts.canHaveModifiers(node) && (ts.getModifiers(node) ?? []).some((m) => m.kind === kind)
}

/** Collects every top-level export binding a route file exposes — `export default <ident>`,
 * `export default function name(...)`, `export function name(...)`, `export const x = ...`,
 * and `export { a as b }` — so route-mount-composition.ts can resolve which file a cross-file
 * mount target actually refers to. Framework-neutral: shared by Express and Fastify parsers. */
export function collectExports(sourceFile: ts.SourceFile): ParsedExport[] {
  const exportedBindings: ParsedExport[] = []
  for (const statement of sourceFile.statements) {
    if (
      ts.isExportAssignment(statement) &&
      !statement.isExportEquals &&
      ts.isIdentifier(statement.expression)
    ) {
      exportedBindings.push({ localName: statement.expression.text, exportedName: 'default' })
      continue
    }
    if (
      ts.isFunctionDeclaration(statement) &&
      statement.name &&
      hasModifier(statement, ts.SyntaxKind.ExportKeyword)
    ) {
      const exportedName = hasModifier(statement, ts.SyntaxKind.DefaultKeyword)
        ? 'default'
        : statement.name.text
      exportedBindings.push({ localName: statement.name.text, exportedName })
      continue
    }
    if (ts.isVariableStatement(statement) && hasModifier(statement, ts.SyntaxKind.ExportKeyword)) {
      for (const decl of statement.declarationList.declarations) {
        if (ts.isIdentifier(decl.name)) {
          exportedBindings.push({ localName: decl.name.text, exportedName: decl.name.text })
        }
      }
      continue
    }
    if (
      ts.isExportDeclaration(statement) &&
      statement.exportClause &&
      ts.isNamedExports(statement.exportClause)
    ) {
      for (const element of statement.exportClause.elements) {
        const localName = (element.propertyName ?? element.name).text
        exportedBindings.push({ localName, exportedName: element.name.text })
      }
    }
  }
  return exportedBindings
}
