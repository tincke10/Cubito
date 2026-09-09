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

describe('parseFastifyRoutes: .route({...}) calls', () => {
  it('extracts a single endpoint for a string method', () => {
    const source = `
      const app = Fastify()
      app.route({ method: 'GET', url: '/items' })
    `
    const result = parseFastifyRoutes(source, FILE)
    expect(result.endpoints).toEqual([{ method: 'GET', path: '/items', routerLocalName: 'app' }])
  })

  it('extracts one endpoint per method for an array of methods', () => {
    const source = `
      const app = Fastify()
      app.route({ method: ['POST', 'PUT'], url: '/items' })
    `
    const result = parseFastifyRoutes(source, FILE)
    expect(result.endpoints).toEqual([
      { method: 'POST', path: '/items', routerLocalName: 'app' },
      { method: 'PUT', path: '/items', routerLocalName: 'app' }
    ])
  })
})

describe('parseFastifyRoutes: same-file plugin registration', () => {
  it('captures endpoints declared inside a registered plugin function under the plugin name', () => {
    const source = `
      const app = Fastify()
      async function usersPlugin(fastify, opts) {
        fastify.get('/', h)
        fastify.get('/:id', h)
      }
      app.register(usersPlugin, { prefix: '/users' })
    `
    const result = parseFastifyRoutes(source, FILE)
    expect(result.endpoints).toEqual([
      { method: 'GET', path: '/', routerLocalName: 'usersPlugin' },
      { method: 'GET', path: '/:id', routerLocalName: 'usersPlugin' }
    ])
    expect(result.mounts).toEqual([
      { prefix: '/users', routerLocalName: 'usersPlugin', parentLocalName: 'app' }
    ])
  })

  it('unwraps a single fp(plugin)-style wrapper call around the plugin identifier', () => {
    const source = `
      const app = Fastify()
      function authPlugin(fastify, opts) {
        fastify.post('/login', h)
      }
      app.register(fp(authPlugin), { prefix: '/auth' })
    `
    const result = parseFastifyRoutes(source, FILE)
    expect(result.mounts).toEqual([
      { prefix: '/auth', routerLocalName: 'authPlugin', parentLocalName: 'app' }
    ])
    expect(result.endpoints).toEqual([
      { method: 'POST', path: '/login', routerLocalName: 'authPlugin' }
    ])
  })

  it('does not cross-contaminate endpoints between two plugins sharing the same parameter name', () => {
    const source = `
      const app = Fastify()
      function usersPlugin(fastify, opts) { fastify.get('/users', h) }
      function ordersPlugin(fastify, opts) { fastify.get('/orders', h) }
      app.register(usersPlugin, { prefix: '/a' })
      app.register(ordersPlugin, { prefix: '/b' })
    `
    const result = parseFastifyRoutes(source, FILE)
    expect(result.endpoints).toEqual([
      { method: 'GET', path: '/users', routerLocalName: 'usersPlugin' },
      { method: 'GET', path: '/orders', routerLocalName: 'ordersPlugin' }
    ])
  })

  it('registers without a mount when no literal prefix is given', () => {
    const source = `
      const app = Fastify()
      function usersPlugin(fastify, opts) { fastify.get('/users', h) }
      app.register(usersPlugin)
    `
    const result = parseFastifyRoutes(source, FILE)
    expect(result.mounts).toEqual([])
    expect(result.endpoints).toEqual([
      { method: 'GET', path: '/users', routerLocalName: 'usersPlugin' }
    ])
  })
})

describe('parseFastifyRoutes: dynamic import()/require() plugin targets', () => {
  it("mounts a register(import('./x'), {prefix}) target via a synthetic import binding", () => {
    const source = `
      const app = Fastify()
      app.register(import('./routes/orders'), { prefix: '/orders' })
    `
    const result = parseFastifyRoutes(source, FILE)
    expect(result.mounts).toEqual([
      { prefix: '/orders', routerLocalName: '__dynamicPluginTarget0', parentLocalName: 'app' }
    ])
    expect(result.imports).toEqual([
      {
        moduleSpecifier: './routes/orders',
        isRelative: true,
        bindings: [{ localName: '__dynamicPluginTarget0', importedName: 'default' }]
      }
    ])
  })

  it('mounts an await import(...) target the same way', () => {
    const source = `
      const app = Fastify()
      app.register(await import('./routes/orders'), { prefix: '/orders' })
    `
    const result = parseFastifyRoutes(source, FILE)
    expect(result.mounts).toEqual([
      { prefix: '/orders', routerLocalName: '__dynamicPluginTarget0', parentLocalName: 'app' }
    ])
  })

  it('mounts a require(...) target the same way', () => {
    const source = `
      const app = Fastify()
      app.register(require('./routes/orders'), { prefix: '/orders' })
    `
    const result = parseFastifyRoutes(source, FILE)
    expect(result.mounts).toEqual([
      { prefix: '/orders', routerLocalName: '__dynamicPluginTarget0', parentLocalName: 'app' }
    ])
    expect(result.imports).toEqual([
      {
        moduleSpecifier: './routes/orders',
        isRelative: true,
        bindings: [{ localName: '__dynamicPluginTarget0', importedName: 'default' }]
      }
    ])
  })
})

describe('parseFastifyRoutes: namespace-import property mount target', () => {
  it('mounts a register(ns.default) target via a synthetic import binding', () => {
    const source = `
      import * as auth from './routes/auth'
      const app = Fastify()
      app.register(auth.default)
    `
    const result = parseFastifyRoutes(source, FILE)
    expect(result.mounts).toEqual([])
    expect(result.imports).toEqual([
      {
        moduleSpecifier: './routes/auth',
        isRelative: true,
        bindings: [{ localName: 'auth', importedName: '*' }]
      },
      {
        moduleSpecifier: './routes/auth',
        isRelative: true,
        bindings: [{ localName: '__dynamicPluginTarget0', importedName: 'default' }]
      }
    ])
  })

  it('mounts a register(ns.default, {prefix}) target with a composed prefix mount', () => {
    const source = `
      import * as auth from './routes/auth'
      const app = Fastify()
      app.register(auth.default, { prefix: '/auth' })
    `
    const result = parseFastifyRoutes(source, FILE)
    expect(result.mounts).toEqual([
      { prefix: '/auth', routerLocalName: '__dynamicPluginTarget0', parentLocalName: 'app' }
    ])
  })
})
