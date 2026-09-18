import { describe, expect, it } from 'vitest'
import { parseHonoRoutes } from './hono-route-parser'

const FILE = 'src/routes.ts'

describe('parseHonoRoutes: statement-style endpoints', () => {
  it('extracts a GET endpoint with a literal path', () => {
    const source = `
      import { Hono } from 'hono'
      const app = new Hono()
      app.get('/users', (c) => c.text('ok'))
    `
    const result = parseHonoRoutes(source, FILE)
    expect(result.endpoints).toEqual([{ method: 'GET', path: '/users', routerLocalName: 'app' }])
  })

  it('upper-cases the HTTP method for every recognized verb', () => {
    const source = `
      const app = new Hono()
      app.get('/a', h)
      app.post('/b', h)
      app.put('/c', h)
      app.delete('/d', h)
      app.patch('/e', h)
      app.options('/f', h)
      app.head('/g', h)
      app.all('/h', h)
    `
    const result = parseHonoRoutes(source, FILE)
    expect(result.endpoints.map((e) => e.method)).toEqual([
      'GET',
      'POST',
      'PUT',
      'DELETE',
      'PATCH',
      'OPTIONS',
      'HEAD',
      'ALL'
    ])
  })

  it('ignores a verb call on a local not bound to new Hono()', () => {
    const source = `
      const app = somethingElse()
      app.get('/users', h)
    `
    const result = parseHonoRoutes(source, FILE)
    expect(result.endpoints).toEqual([])
  })

  it('degrades a non-literal path to <dynamic> instead of throwing', () => {
    const source = `
      const app = new Hono()
      const routePath = computePath()
      app.get(routePath, h)
    `
    const result = parseHonoRoutes(source, FILE)
    expect(result.endpoints).toEqual([{ method: 'GET', path: '<dynamic>', routerLocalName: 'app' }])
  })
})

describe('parseHonoRoutes: fluent-chain endpoints', () => {
  it('extracts each chained verb call as its own endpoint', () => {
    const source = `
      const app = new Hono().get('/a', h1).post('/b', h2)
    `
    const result = parseHonoRoutes(source, FILE)
    expect(result.endpoints).toEqual([
      { method: 'GET', path: '/a', routerLocalName: 'app' },
      { method: 'POST', path: '/b', routerLocalName: 'app' }
    ])
  })

  it('ignores a fluent chain whose receiver does not bottom out at new Hono()', () => {
    const source = `
      const app = somethingElse().get('/a', h1)
    `
    const result = parseHonoRoutes(source, FILE)
    expect(result.endpoints).toEqual([])
  })
})

describe('parseHonoRoutes: anonymous default-export fluent chain', () => {
  it('collects the endpoint and synthesizes a default export entry', () => {
    const source = `
      export default new Hono().get('/a', h1)
    `
    const result = parseHonoRoutes(source, FILE)
    expect(result.endpoints).toEqual([
      { method: 'GET', path: '/a', routerLocalName: '__defaultHonoExport' }
    ])
    expect(result.exports).toContainEqual({
      localName: '__defaultHonoExport',
      exportedName: 'default'
    })
  })
})

describe('parseHonoRoutes: .use() is never a mount', () => {
  it('does not create a mount from .use() on a Hono instance', () => {
    const source = `
      const app = new Hono()
      const sub = new Hono()
      app.use('/x', sub)
    `
    const result = parseHonoRoutes(source, FILE)
    expect(result.mounts).toEqual([])
  })
})

describe('parseHonoRoutes: malformed source', () => {
  it('never throws on invalid or partial TypeScript, returning a partial result', () => {
    const source = `
      const app = new Hono(
      app.get('/broken'
    `
    expect(() => parseHonoRoutes(source, FILE)).not.toThrow()
    const result = parseHonoRoutes(source, FILE)
    expect(result.filePath).toBe(FILE)
    expect(Array.isArray(result.endpoints)).toBe(true)
    expect(Array.isArray(result.mounts)).toBe(true)
    expect(Array.isArray(result.imports)).toBe(true)
  })
})
