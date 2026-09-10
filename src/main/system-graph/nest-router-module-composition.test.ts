import { describe, expect, it } from 'vitest'
import type { ParsedRouteFile } from './framework-route-model'
import { composeRouterModulePrefixes } from './nest-router-module-composition'
import type { RouterModuleRoute } from './nest-router-module-registration'

function routeFile(overrides: Partial<ParsedRouteFile> & { filePath: string }): ParsedRouteFile {
  return { endpoints: [], mounts: [], imports: [], exports: [], ...overrides }
}

describe('composeRouterModulePrefixes: single level', () => {
  it('composes a prefix for a controller reached through one RouterModule.register route', () => {
    const appModule = routeFile({
      filePath: 'src/app.module.ts',
      imports: [
        {
          moduleSpecifier: './admin/admin.module',
          isRelative: true,
          bindings: [{ localName: 'AdminModule', importedName: 'AdminModule' }]
        }
      ],
      moduleDescriptor: {
        controllers: [],
        routerRoutes: [{ path: 'admin', moduleLocalName: 'AdminModule', children: [] }]
      }
    })
    const adminModule = routeFile({
      filePath: 'src/admin/admin.module.ts',
      imports: [
        {
          moduleSpecifier: './admin.controller',
          isRelative: true,
          bindings: [{ localName: 'AdminController', importedName: 'AdminController' }]
        }
      ],
      moduleDescriptor: { controllers: ['AdminController'], routerRoutes: [] }
    })
    const adminController = routeFile({
      filePath: 'src/admin/admin.controller.ts',
      endpoints: [{ method: 'GET', path: '/', routerLocalName: 'AdminController' }]
    })

    const composed = composeRouterModulePrefixes([appModule, adminModule, adminController])

    expect(composed.get('src/admin/admin.controller.ts')?.get('AdminController')).toBe('/admin')
  })
})

describe('composeRouterModulePrefixes: nested children compose root-to-leaf', () => {
  it('accumulates the prefix through a grouping module and its leaf child', () => {
    const appModule = routeFile({
      filePath: 'src/app.module.ts',
      imports: [
        {
          moduleSpecifier: './admin/admin.module',
          isRelative: true,
          bindings: [{ localName: 'AdminModule', importedName: 'AdminModule' }]
        },
        {
          moduleSpecifier: './admin/users/admin-users.module',
          isRelative: true,
          bindings: [{ localName: 'AdminUsersModule', importedName: 'AdminUsersModule' }]
        }
      ],
      moduleDescriptor: {
        controllers: [],
        routerRoutes: [
          {
            path: 'admin',
            moduleLocalName: 'AdminModule',
            children: [{ path: 'users', moduleLocalName: 'AdminUsersModule', children: [] }]
          }
        ]
      }
    })
    // Pure grouping module: zero controllers, zero children of its own — only its position in
    // the tree contributes the 'admin' segment.
    const adminModule = routeFile({
      filePath: 'src/admin/admin.module.ts',
      moduleDescriptor: { controllers: [], routerRoutes: [] }
    })
    const adminUsersModule = routeFile({
      filePath: 'src/admin/users/admin-users.module.ts',
      imports: [
        {
          moduleSpecifier: './admin-users.controller',
          isRelative: true,
          bindings: [{ localName: 'AdminUsersController', importedName: 'AdminUsersController' }]
        }
      ],
      moduleDescriptor: { controllers: ['AdminUsersController'], routerRoutes: [] }
    })
    const adminUsersController = routeFile({
      filePath: 'src/admin/users/admin-users.controller.ts',
      endpoints: [{ method: 'GET', path: '/', routerLocalName: 'AdminUsersController' }]
    })

    const composed = composeRouterModulePrefixes([
      appModule,
      adminModule,
      adminUsersModule,
      adminUsersController
    ])

    expect(
      composed.get('src/admin/users/admin-users.controller.ts')?.get('AdminUsersController')
    ).toBe('/admin/users')
  })
})

describe('composeRouterModulePrefixes: edge cases', () => {
  it('drops a route whose moduleLocalName is not imported in the owner file (unresolved module)', () => {
    const appModule = routeFile({
      filePath: 'src/app.module.ts',
      moduleDescriptor: {
        controllers: [],
        routerRoutes: [{ path: 'admin', moduleLocalName: 'AdminModule', children: [] }]
      }
    })

    const composed = composeRouterModulePrefixes([appModule])

    expect(composed.size).toBe(0)
  })

  it('drops an unresolved controller identifier while keeping the rest', () => {
    const appModule = routeFile({
      filePath: 'src/app.module.ts',
      imports: [
        {
          moduleSpecifier: './admin/admin.module',
          isRelative: true,
          bindings: [{ localName: 'AdminModule', importedName: 'AdminModule' }]
        }
      ],
      moduleDescriptor: {
        controllers: [],
        routerRoutes: [{ path: 'admin', moduleLocalName: 'AdminModule', children: [] }]
      }
    })
    // AdminModule declares a controller it never actually imports — the parser can't drop this
    // at parse time (it doesn't cross-reference imports), so composition must drop it instead.
    const adminModule = routeFile({
      filePath: 'src/admin/admin.module.ts',
      moduleDescriptor: { controllers: ['UnknownController'], routerRoutes: [] }
    })

    const composed = composeRouterModulePrefixes([appModule, adminModule])

    expect(composed.size).toBe(0)
  })

  it('returns an empty map for files with no moduleDescriptor at all (express/fastify)', () => {
    const app = routeFile({
      filePath: 'src/app.ts',
      endpoints: [{ method: 'GET', path: '/', routerLocalName: null }]
    })

    expect(composeRouterModulePrefixes([app]).size).toBe(0)
  })

  // The real parser only ever produces a finite, literal AST tree for `children` — it can never
  // self-reference. This synthetic case constructs one anyway to prove the visited-set guard
  // (mirroring route-mount-composition.ts's cycle guard) actually stops recursion rather than
  // relying on tree shape alone.
  it('never throws or hangs on a synthetic self-referencing children array', () => {
    const owner = routeFile({
      filePath: 'src/app.module.ts',
      imports: [
        {
          moduleSpecifier: './a.module',
          isRelative: true,
          bindings: [{ localName: 'ModuleA', importedName: 'ModuleA' }]
        }
      ]
    })
    const moduleA = routeFile({
      filePath: 'src/a.module.ts',
      moduleDescriptor: { controllers: [], routerRoutes: [] }
    })
    const cyclicRoute: RouterModuleRoute = { path: 'a', moduleLocalName: 'ModuleA', children: [] }
    cyclicRoute.children.push(cyclicRoute)
    owner.moduleDescriptor = { controllers: [], routerRoutes: [cyclicRoute] }

    expect(() => composeRouterModulePrefixes([owner, moduleA])).not.toThrow()
  })
})

// Locked in deliberately, not "fixed": a controller that keeps its own @Controller('users')
// prefix while also being registered under a RouterModule path segment named 'users' produces a
// genuine double 'users' segment in real Nest. composeRouterModulePrefixes only owns the
// router-module PREFIX ('/admin/users'); concatenating it with the controller's own
// already-prefixed endpoint path ('/users', from its own decorator) is service-db-heuristic.ts's
// job (W7) — reproduced inline here with plain string concatenation to lock in the expectation
// before appendNestPrefix exists.
describe('composeRouterModulePrefixes: real-Nest double-segment quirk', () => {
  it('composes /admin/users for a controller whose own prefix also adds /users', () => {
    const appModule = routeFile({
      filePath: 'src/app.module.ts',
      imports: [
        {
          moduleSpecifier: './admin.module',
          isRelative: true,
          bindings: [{ localName: 'AdminModule', importedName: 'AdminModule' }]
        },
        {
          moduleSpecifier: './users-router.module',
          isRelative: true,
          bindings: [{ localName: 'UsersRouterModule', importedName: 'UsersRouterModule' }]
        }
      ],
      moduleDescriptor: {
        controllers: [],
        routerRoutes: [
          {
            path: 'admin',
            moduleLocalName: 'AdminModule',
            children: [{ path: 'users', moduleLocalName: 'UsersRouterModule', children: [] }]
          }
        ]
      }
    })
    const adminModule = routeFile({
      filePath: 'src/admin.module.ts',
      moduleDescriptor: { controllers: [], routerRoutes: [] }
    })
    const usersRouterModule = routeFile({
      filePath: 'src/users-router.module.ts',
      imports: [
        {
          moduleSpecifier: './users/users.controller',
          isRelative: true,
          bindings: [{ localName: 'UsersController', importedName: 'UsersController' }]
        }
      ],
      moduleDescriptor: { controllers: ['UsersController'], routerRoutes: [] }
    })
    // @Controller('users') — its OWN prefix, independent of the RouterModule tree above.
    const usersController = routeFile({
      filePath: 'src/users/users.controller.ts',
      endpoints: [{ method: 'GET', path: '/users', routerLocalName: 'UsersController' }]
    })

    const composed = composeRouterModulePrefixes([
      appModule,
      adminModule,
      usersRouterModule,
      usersController
    ])
    const prefix = composed.get('src/users/users.controller.ts')?.get('UsersController')

    expect(prefix).toBe('/admin/users')
    expect(`${prefix}${usersController.endpoints[0].path}`).toBe('/admin/users/users')
  })
})
