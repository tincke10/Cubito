import { describe, expect, it } from 'vitest'
import { expressRouteParser } from './express-route-parser'
import { fastifyRouteParser } from './fastify-route-parser'
import { frameworkRouteParsers } from './framework-route-parser-registry'
import { nestRouteParser } from './nest-route-parser'

describe('frameworkRouteParsers', () => {
  it('maps express to the express parser', () => {
    expect(frameworkRouteParsers.express).toBe(expressRouteParser)
  })

  it('maps fastify to the fastify parser', () => {
    expect(frameworkRouteParsers.fastify).toBe(fastifyRouteParser)
  })

  it('maps nest to the nest parser', () => {
    expect(frameworkRouteParsers.nest).toBe(nestRouteParser)
  })
})
