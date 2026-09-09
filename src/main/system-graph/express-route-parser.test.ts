import { describe, expect, it } from 'vitest'
import { parseExpressRoutes } from './express-route-parser'

const FILE = 'src/routes.ts'

describe('parseExpressRoutes: app.<method> endpoints', () => {
  it('extracts a GET endpoint with a literal path', () => {
    const source = `
      import express from 'express'
      const app = express()
      app.get('/users', (req, res) => res.send('ok'))
    `
    const result = parseExpressRoutes(source, FILE)
    expect(result.endpoints).toEqual([{ method: 'GET', path: '/users', routerLocalName: 'app' }])
  })

  it('upper-cases the HTTP method for every recognized verb', () => {
    const source = `
      const app = express()
      app.get('/a', h)
      app.post('/b', h)
      app.put('/c', h)
      app.delete('/d', h)
      app.patch('/e', h)
      app.options('/f', h)
      app.head('/g', h)
      app.all('/h', h)
    `
    const result = parseExpressRoutes(source, FILE)
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
})

describe('parseExpressRoutes: express.Router() binding', () => {
  it('recognizes a router local bound via express.Router() and its endpoints', () => {
    const source = `
      const router = express.Router()
      router.get('/ping', h)
    `
    const result = parseExpressRoutes(source, FILE)
    expect(result.endpoints).toEqual([{ method: 'GET', path: '/ping', routerLocalName: 'router' }])
  })
})

describe('parseExpressRoutes: app.use mount capture', () => {
  it('captures a router mount with its prefix and local names', () => {
    const source = `
      const app = express()
      const router = express.Router()
      app.use('/api', router)
    `
    const result = parseExpressRoutes(source, FILE)
    expect(result.mounts).toEqual([
      { prefix: '/api', routerLocalName: 'router', parentLocalName: 'app' }
    ])
  })
})

describe('parseExpressRoutes: app.use mount via namespace-import property access', () => {
  it('captures a mount whose target is ns.default from a namespace import', () => {
    const source = `
      import * as users from './routes/users'
      const app = express()
      app.use('/users', users.default)
    `
    const result = parseExpressRoutes(source, FILE)
    expect(result.mounts).toEqual([
      { prefix: '/users', routerLocalName: '__dynamicMountTarget0', parentLocalName: 'app' }
    ])
    expect(result.imports).toContainEqual({
      moduleSpecifier: './routes/users',
      isRelative: true,
      bindings: [{ localName: '__dynamicMountTarget0', importedName: 'default' }]
    })
  })

  it('captures a mount whose target is a named property on the namespace import', () => {
    const source = `
      import * as users from './routes/users'
      const app = express()
      app.use('/users', users.router)
    `
    const result = parseExpressRoutes(source, FILE)
    expect(result.mounts).toEqual([
      { prefix: '/users', routerLocalName: '__dynamicMountTarget0', parentLocalName: 'app' }
    ])
    expect(result.imports).toContainEqual({
      moduleSpecifier: './routes/users',
      isRelative: true,
      bindings: [{ localName: '__dynamicMountTarget0', importedName: 'router' }]
    })
  })
})

describe('parseExpressRoutes: app.route() chains', () => {
  it('extracts each chained method as its own endpoint on the same path', () => {
    const source = `
      const app = express()
      app.route('/items').get(h).post(h)
    `
    const result = parseExpressRoutes(source, FILE)
    expect(result.endpoints).toEqual([
      { method: 'GET', path: '/items', routerLocalName: 'app' },
      { method: 'POST', path: '/items', routerLocalName: 'app' }
    ])
  })
})

describe('parseExpressRoutes: dynamic paths', () => {
  it('degrades a non-literal path to <dynamic> instead of throwing', () => {
    const source = `
      const app = express()
      const routePath = computePath()
      app.get(routePath, h)
    `
    const result = parseExpressRoutes(source, FILE)
    expect(result.endpoints).toEqual([{ method: 'GET', path: '<dynamic>', routerLocalName: 'app' }])
  })

  it('degrades a template literal with substitutions to <dynamic>', () => {
    const source = `
      const app = express()
      app.get(\`/users/\${id}\`, h)
    `
    const result = parseExpressRoutes(source, FILE)
    expect(result.endpoints).toEqual([{ method: 'GET', path: '<dynamic>', routerLocalName: 'app' }])
  })
})

describe('parseExpressRoutes: malformed source', () => {
  it('never throws on invalid or partial TypeScript, returning a partial result', () => {
    const source = `
      const app = express(
      app.get('/broken'
    `
    expect(() => parseExpressRoutes(source, FILE)).not.toThrow()
    const result = parseExpressRoutes(source, FILE)
    expect(result.filePath).toBe(FILE)
    expect(Array.isArray(result.endpoints)).toBe(true)
    expect(Array.isArray(result.mounts)).toBe(true)
    expect(Array.isArray(result.imports)).toBe(true)
  })
})

describe('parseExpressRoutes: imports', () => {
  it('flags relative imports as isRelative true', () => {
    const source = `import { router } from './routes/users'`
    const result = parseExpressRoutes(source, FILE)
    expect(result.imports).toEqual([
      {
        moduleSpecifier: './routes/users',
        isRelative: true,
        bindings: [{ localName: 'router', importedName: 'router' }]
      }
    ])
  })

  it('flags package imports as isRelative false', () => {
    const source = `import express from 'express'`
    const result = parseExpressRoutes(source, FILE)
    expect(result.imports).toEqual([
      {
        moduleSpecifier: 'express',
        isRelative: false,
        bindings: [{ localName: 'express', importedName: 'default' }]
      }
    ])
  })
})
