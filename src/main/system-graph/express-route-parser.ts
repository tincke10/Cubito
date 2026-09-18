import ts from 'typescript-compiler-api'
import type { FrameworkRouteParser, ParsedRouteFile } from './framework-route-model'
import { collectInstanceEndpointsAndMounts } from './instance-route-mount-collector'
import {
  collectExports,
  collectImports,
  collectNamespaceImportLocalNames,
  collectRelativeImportLocalNames,
  isBareIdentifierCall
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
    const { endpoints, mounts, syntheticImports } = collectInstanceEndpointsAndMounts(
      sourceFile,
      routerLocals,
      relativeImportLocalNames,
      namespaceImportLocalNames,
      { mountMethodName: 'use', supportsRouteChain: true }
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
