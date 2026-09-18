import { expressRouteParser } from './express-route-parser'
import { fastifyRouteParser } from './fastify-route-parser'
import type { EngineFramework } from './framework-detector'
import type { FrameworkRouteParser } from './framework-route-model'
import { honoRouteParser } from './hono-route-parser'
import { nestRouteParser } from './nest-route-parser'

export const frameworkRouteParsers = {
  express: expressRouteParser,
  fastify: fastifyRouteParser,
  nest: nestRouteParser,
  hono: honoRouteParser
} satisfies Record<EngineFramework, FrameworkRouteParser>
