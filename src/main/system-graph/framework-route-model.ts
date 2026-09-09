import type { EngineFramework } from './framework-detector'

export type ParsedImport = { moduleSpecifier: string; isRelative: boolean }
export type ParsedEndpoint = { method: string; path: string; routerLocalName: string | null }
export type ParsedRouterMount = {
  prefix: string
  routerLocalName: string
  parentLocalName: string | null
}
export type ParsedRouteFile = {
  filePath: string
  endpoints: ParsedEndpoint[]
  mounts: ParsedRouterMount[]
  imports: ParsedImport[]
}

/** Reader-agnostic per-file route parser for one detected framework. */
export type FrameworkRouteParser = {
  framework: EngineFramework
  parse(source: string, filePath: string): ParsedRouteFile
}
