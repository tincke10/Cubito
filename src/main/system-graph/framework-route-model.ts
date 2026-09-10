import type { EngineFramework } from './framework-detector'
import type { NestModuleDescriptor } from './nest-router-module-registration'

/** A local name an import statement binds, and the name it was imported as
 * ('default' for a default import, '*' for a namespace import). */
export type ParsedImportBinding = { localName: string; importedName: string }
export type ParsedImport = {
  moduleSpecifier: string
  isRelative: boolean
  bindings?: ParsedImportBinding[]
}
export type ParsedEndpoint = { method: string; path: string; routerLocalName: string | null }
export type ParsedRouterMount = {
  prefix: string
  routerLocalName: string
  parentLocalName: string | null
}
/** A local name a file exports, and the name it's exported as ('default' for `export default`). */
export type ParsedExport = { localName: string; exportedName: string }
export type ParsedRouteFile = {
  filePath: string
  endpoints: ParsedEndpoint[]
  mounts: ParsedRouterMount[]
  imports: ParsedImport[]
  exports: ParsedExport[]
  /** Nest-only: set on whichever file calls `app.setGlobalPrefix(...)` (normally main.ts).
   * Omitted (never undefined-valued) for every other file/framework. */
  globalPrefix?: string
  /** Nest-only: set on a file with an `@Module(...)`-decorated class. Omitted (never
   * undefined-valued) for every other file/framework. */
  moduleDescriptor?: NestModuleDescriptor
}

/** Reader-agnostic per-file route parser for one detected framework. */
export type FrameworkRouteParser = {
  framework: EngineFramework
  parse(source: string, filePath: string): ParsedRouteFile
}
