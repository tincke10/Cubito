import { expressRouteParser } from './express-route-parser'
import { fastifyRouteParser } from './fastify-route-parser'
import type { EngineFramework } from './framework-detector'
import type { FrameworkRouteParser } from './framework-route-model'

export const frameworkRouteParsers = {
  express: expressRouteParser,
  fastify: fastifyRouteParser
} satisfies Record<EngineFramework, FrameworkRouteParser>
