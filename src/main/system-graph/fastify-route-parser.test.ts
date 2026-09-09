import { describe, expect, it } from 'vitest'
import { parseFastifyRoutes } from './fastify-route-parser'

const FILE = 'src/app.ts'

describe('parseFastifyRoutes: verb endpoints on a Fastify() instance', () => {
  it('extracts GET and POST endpoints with literal paths', () => {
    const source = `
      import Fastify from 'fastify'
      const app = Fastify()
      app.get('/health', async () => 'ok')
      app.post('/users', async () => 'created')
    `
    const result = parseFastifyRoutes(source, FILE)
    expect(result.endpoints).toEqual([
      { method: 'GET', path: '/health', routerLocalName: 'app' },
      { method: 'POST', path: '/users', routerLocalName: 'app' }
    ])
  })

  it('degrades a non-literal path to <dynamic> instead of throwing', () => {
    const source = `
      const app = fastify()
      app.get(computePath(), h)
    `
    const result = parseFastifyRoutes(source, FILE)
    expect(result.endpoints).toEqual([{ method: 'GET', path: '<dynamic>', routerLocalName: 'app' }])
  })

  it('never throws on malformed source, returning a partial result', () => {
    const source = `
      const app = fastify(
      app.get('/broken'
    `
    expect(() => parseFastifyRoutes(source, FILE)).not.toThrow()
    const result = parseFastifyRoutes(source, FILE)
    expect(result.filePath).toBe(FILE)
    expect(Array.isArray(result.endpoints)).toBe(true)
    expect(Array.isArray(result.mounts)).toBe(true)
    expect(Array.isArray(result.imports)).toBe(true)
  })
})
