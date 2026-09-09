import { describe, expect, it } from 'vitest'
import type { ParsedRouteFile } from './framework-route-model'
import { composeMountPrefixes } from './route-mount-composition'

function routeFile(overrides: Partial<ParsedRouteFile> & { filePath: string }): ParsedRouteFile {
  return { endpoints: [], mounts: [], imports: [], exports: [], ...overrides }
}

describe('composeMountPrefixes: Express cross-file mounts', () => {
  it('composes a default-exported router imported and mounted from another file', () => {
    const index = routeFile({
      filePath: 'src/index.ts',
      imports: [
        {
          moduleSpecifier: './routes/users',
          isRelative: true,
          bindings: [{ localName: 'usersRouter', importedName: 'default' }]
        }
      ],
      mounts: [{ prefix: '/users', routerLocalName: 'usersRouter', parentLocalName: 'app' }]
    })
    const users = routeFile({
      filePath: 'src/routes/users.ts',
      endpoints: [{ method: 'GET', path: '/', routerLocalName: 'router' }],
      exports: [{ localName: 'router', exportedName: 'default' }]
    })

    const composed = composeMountPrefixes([index, users])

    expect(composed.get('src/routes/users.ts')?.get('router')).toBe('/users')
  })

  it('composes a named-exported router', () => {
    const index = routeFile({
      filePath: 'src/index.ts',
      imports: [
        {
          moduleSpecifier: './routes/users',
          isRelative: true,
          bindings: [{ localName: 'usersRouter', importedName: 'usersRouter' }]
        }
      ],
      mounts: [{ prefix: '/users', routerLocalName: 'usersRouter', parentLocalName: 'app' }]
    })
    const users = routeFile({
      filePath: 'src/routes/users.ts',
      endpoints: [{ method: 'GET', path: '/', routerLocalName: 'usersRouter' }],
      exports: [{ localName: 'usersRouter', exportedName: 'usersRouter' }]
    })

    const composed = composeMountPrefixes([index, users])

    expect(composed.get('src/routes/users.ts')?.get('usersRouter')).toBe('/users')
  })
})

describe('composeMountPrefixes: Fastify cross-file plugin registration', () => {
  it('composes a plugin registered directly by its imported identifier', () => {
    const app = routeFile({
      filePath: 'src/app.ts',
      imports: [
        {
          moduleSpecifier: './routes/users',
          isRelative: true,
          bindings: [{ localName: 'usersPlugin', importedName: 'default' }]
        }
      ],
      mounts: [{ prefix: '/users', routerLocalName: 'usersPlugin', parentLocalName: 'fastify' }]
    })
    const users = routeFile({
      filePath: 'src/routes/users.ts',
      endpoints: [{ method: 'GET', path: '/', routerLocalName: 'usersPlugin' }],
      exports: [{ localName: 'usersPlugin', exportedName: 'default' }]
    })

    const composed = composeMountPrefixes([app, users])

    expect(composed.get('src/routes/users.ts')?.get('usersPlugin')).toBe('/users')
  })

  it('composes a plugin registered through an fp(...)-wrapped call by resolving to the same import binding', () => {
    // The parser already unwraps fp(plugin) to the plugin's local name before this stage runs,
    // so the mount looks identical to the direct-registration case from here.
    const app = routeFile({
      filePath: 'src/app.ts',
      imports: [
        {
          moduleSpecifier: './routes/auth',
          isRelative: true,
          bindings: [{ localName: 'authPlugin', importedName: 'default' }]
        }
      ],
      mounts: [{ prefix: '/auth', routerLocalName: 'authPlugin', parentLocalName: 'fastify' }]
    })
    const auth = routeFile({
      filePath: 'src/routes/auth.ts',
      endpoints: [{ method: 'POST', path: '/login', routerLocalName: 'authPlugin' }],
      exports: [{ localName: 'authPlugin', exportedName: 'default' }]
    })

    const composed = composeMountPrefixes([app, auth])

    expect(composed.get('src/routes/auth.ts')?.get('authPlugin')).toBe('/auth')
  })
})

describe('composeMountPrefixes: nested chains', () => {
  it('composes a prefix across three files', () => {
    const index = routeFile({
      filePath: 'src/index.ts',
      imports: [
        {
          moduleSpecifier: './routes/api',
          isRelative: true,
          bindings: [{ localName: 'apiRouter', importedName: 'default' }]
        }
      ],
      mounts: [{ prefix: '/api', routerLocalName: 'apiRouter', parentLocalName: 'app' }]
    })
    const api = routeFile({
      filePath: 'src/routes/api.ts',
      imports: [
        {
          moduleSpecifier: './api/users',
          isRelative: true,
          bindings: [{ localName: 'usersRouter', importedName: 'default' }]
        }
      ],
      mounts: [{ prefix: '/users', routerLocalName: 'usersRouter', parentLocalName: 'router' }],
      exports: [{ localName: 'router', exportedName: 'default' }]
    })
    const users = routeFile({
      filePath: 'src/routes/api/users.ts',
      endpoints: [{ method: 'GET', path: '/', routerLocalName: 'router' }],
      exports: [{ localName: 'router', exportedName: 'default' }]
    })

    const composed = composeMountPrefixes([index, api, users])

    expect(composed.get('src/routes/api/users.ts')?.get('router')).toBe('/api/users')
  })
})

describe('composeMountPrefixes: edge cases', () => {
  it('does not create an entry for an unresolved import specifier', () => {
    const index = routeFile({
      filePath: 'src/index.ts',
      imports: [
        {
          moduleSpecifier: './routes/missing',
          isRelative: true,
          bindings: [{ localName: 'missingRouter', importedName: 'default' }]
        }
      ],
      mounts: [{ prefix: '/missing', routerLocalName: 'missingRouter', parentLocalName: 'app' }]
    })

    const composed = composeMountPrefixes([index])

    expect(composed.size).toBe(0)
  })

  it('never throws or hangs on an import cycle between two files', () => {
    const a = routeFile({
      filePath: 'src/a.ts',
      imports: [
        {
          moduleSpecifier: './b',
          isRelative: true,
          bindings: [{ localName: 'bRouter', importedName: 'default' }]
        }
      ],
      mounts: [{ prefix: '/b', routerLocalName: 'bRouter', parentLocalName: 'aRouter' }],
      exports: [{ localName: 'aRouter', exportedName: 'default' }]
    })
    const b = routeFile({
      filePath: 'src/b.ts',
      imports: [
        {
          moduleSpecifier: './a',
          isRelative: true,
          bindings: [{ localName: 'aRouter', importedName: 'default' }]
        }
      ],
      mounts: [{ prefix: '/a', routerLocalName: 'aRouter', parentLocalName: 'bRouter' }],
      exports: [{ localName: 'bRouter', exportedName: 'default' }]
    })

    expect(() => composeMountPrefixes([a, b])).not.toThrow()
  })

  it('returns an empty map when no file has any mounts', () => {
    const only = routeFile({ filePath: 'src/index.ts' })
    expect(composeMountPrefixes([only]).size).toBe(0)
  })
})
