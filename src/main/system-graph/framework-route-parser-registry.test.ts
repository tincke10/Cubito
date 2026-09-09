import { describe, expect, it } from 'vitest'
import { expressRouteParser } from './express-route-parser'
import { fastifyRouteParser } from './fastify-route-parser'
import { frameworkRouteParsers } from './framework-route-parser-registry'

describe('frameworkRouteParsers', () => {
  it('maps express to the express parser', () => {
    expect(frameworkRouteParsers.express).toBe(expressRouteParser)
  })

  it('maps fastify to the fastify parser', () => {
    expect(frameworkRouteParsers.fastify).toBe(fastifyRouteParser)
  })
})
