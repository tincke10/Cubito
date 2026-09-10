import ts from 'typescript-compiler-api'
import type { FrameworkRouteParser, ParsedRouteFile } from './framework-route-model'
import { collectGlobalPrefix } from './nest-global-prefix'
import { collectNestEndpoints } from './nest-controller-collector'
import { collectModuleDescriptor } from './nest-router-module-registration'
import { collectExports, collectImports } from './route-call-ast'

function emptyResult(filePath: string): ParsedRouteFile {
  return { filePath, endpoints: [], mounts: [], imports: [], exports: [] }
}

/** Pure Nest/TS route extraction over an AST; never throws — invalid input yields a partial
 * result. Nest never populates mounts: controller-prefix + method-path composition happens
 * inside the decorator walk itself, producing an already-final endpoint.path. */
export function parseNestRoutes(source: string, filePath: string): ParsedRouteFile {
  try {
    const sourceFile = ts.createSourceFile(
      filePath,
      source,
      ts.ScriptTarget.Latest,
      /* setParentNodes */ true,
      ts.ScriptKind.TS
    )
    const globalPrefix = collectGlobalPrefix(sourceFile)
    const moduleDescriptor = collectModuleDescriptor(sourceFile)
    return {
      filePath,
      endpoints: collectNestEndpoints(sourceFile),
      mounts: [],
      imports: collectImports(sourceFile),
      exports: collectExports(sourceFile),
      ...(globalPrefix !== undefined ? { globalPrefix } : {}),
      ...(moduleDescriptor !== undefined ? { moduleDescriptor } : {})
    }
  } catch {
    return emptyResult(filePath)
  }
}

export const nestRouteParser: FrameworkRouteParser = {
  framework: 'nest',
  parse: parseNestRoutes
}
