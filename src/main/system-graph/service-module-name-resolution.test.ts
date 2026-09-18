import { describe, expect, it } from 'vitest'
import type { ParsedRouteFile } from './framework-route-model'
import {
  collectServiceModuleNames,
  moduleNameFromSpecifier
} from './service-module-name-resolution'

function routeFile(overrides: Partial<ParsedRouteFile> & { filePath: string }): ParsedRouteFile {
  return { endpoints: [], mounts: [], imports: [], exports: [], ...overrides }
}

describe('moduleNameFromSpecifier', () => {
  it('takes the last path segment', () => {
    expect(moduleNameFromSpecifier('./services/user-service')).toBe('user-service')
  })

  it('collapses a trailing index segment to the parent directory name', () => {
    expect(moduleNameFromSpecifier('./services/user/index')).toBe('user')
  })
})

describe('collectServiceModuleNames: grouping from relative imports', () => {
  it('groups a relative import by its immediate module name', () => {
    const files = [
      routeFile({
        filePath: 'src/routes/users.ts',
        imports: [{ moduleSpecifier: './services/user-service', isRelative: true }]
      })
    ]
    expect(collectServiceModuleNames(files)).toEqual(['user-service'])
  })

  it('ignores non-relative (package) imports', () => {
    const files = [
      routeFile({
        filePath: 'src/routes/users.ts',
        imports: [{ moduleSpecifier: 'express', isRelative: false }]
      })
    ]
    expect(collectServiceModuleNames(files)).toEqual([])
  })

  // Unit-level lock for the "endpoints>0" branch of isRouteModuleImport, in isolation from any
  // parser: an unprefixed cross-file mount never lands in file.mounts (only a prefixed one does),
  // so exclusion must come from the imported file having endpoints of its own, not from `mounts`.
  it('excludes a relative import when its target file has endpoints, even with an empty mounts array', () => {
    const importer = routeFile({
      filePath: 'src/index.ts',
      mounts: [],
      imports: [
        {
          moduleSpecifier: './routes/users',
          isRelative: true,
          bindings: [{ localName: 'usersRouter', importedName: 'default' }]
        }
      ]
    })
    const usersRouteModule = routeFile({
      filePath: 'src/routes/users.ts',
      endpoints: [{ method: 'GET', path: '/', routerLocalName: 'router' }]
    })
    expect(collectServiceModuleNames([importer, usersRouteModule])).toEqual([])
  })

  it('collapses a trailing index segment to the parent directory name', () => {
    const files = [
      routeFile({
        filePath: 'src/routes/users.ts',
        imports: [{ moduleSpecifier: './services/user/index', isRelative: true }]
      })
    ]
    expect(collectServiceModuleNames(files)).toEqual(['user'])
  })

  it('dedupes the same module name imported from multiple route files', () => {
    const files = [
      routeFile({
        filePath: 'src/routes/a.ts',
        imports: [{ moduleSpecifier: './services/user-service', isRelative: true }]
      }),
      routeFile({
        filePath: 'src/routes/b.ts',
        imports: [{ moduleSpecifier: '../services/user-service', isRelative: true }]
      })
    ]
    expect(collectServiceModuleNames(files)).toEqual(['user-service'])
  })

  it('caps distinct service module names at 24, keeping first-seen order', () => {
    const files = [
      routeFile({
        filePath: 'src/routes/a.ts',
        imports: Array.from({ length: 30 }, (_, i) => ({
          moduleSpecifier: `./services/service-${i}`,
          isRelative: true
        }))
      })
    ]
    const names = collectServiceModuleNames(files)
    expect(names).toHaveLength(24)
    expect(names[0]).toBe('service-0')
    expect(names[23]).toBe('service-23')
  })
})

// Nest-shaped wiring: an entry file (0 endpoints, no mounts) imports a module-descriptor file
// (0 endpoints, no mounts of its own) that in turn imports controller files (endpoints > 0).
// Neither the entry file nor the module-descriptor file is a data/service dependency — the
// module-descriptor is wiring, not a service, even though it never appears in any `mounts` array.
describe('collectServiceModuleNames: excludes a module-descriptor file reached only through another zero-endpoint file', () => {
  it('does not turn an entry-file import of a wiring module into a service name', () => {
    const main = routeFile({
      filePath: 'src/main.ts',
      imports: [
        {
          moduleSpecifier: './app.module',
          isRelative: true,
          bindings: [{ localName: 'AppModule', importedName: 'AppModule' }]
        }
      ]
    })
    const appModule = routeFile({
      filePath: 'src/app.module.ts',
      imports: [
        {
          moduleSpecifier: './users/users.controller',
          isRelative: true,
          bindings: [{ localName: 'UsersController', importedName: 'UsersController' }]
        }
      ]
    })
    const usersController = routeFile({
      filePath: 'src/users/users.controller.ts',
      endpoints: [{ method: 'GET', path: '/users', routerLocalName: 'UsersController' }]
    })

    expect(collectServiceModuleNames([main, appModule, usersController])).toEqual([])
  })

  // A pure grouping @Module({}) (e.g. AdminModule used only as a RouterModule.register target)
  // has ZERO endpoints AND zero relative imports of its own — wiresRouteModule's one-level-deep
  // check can't see past it. Any file with a parsed moduleDescriptor must be always-wiring.
  it('does not turn an import of a pure grouping @Module({}) file into a service name', () => {
    const controller = routeFile({
      filePath: 'src/admin/users/admin-users.controller.ts',
      endpoints: [{ method: 'GET', path: '/', routerLocalName: 'AdminUsersController' }],
      imports: [
        {
          moduleSpecifier: '../admin.module',
          isRelative: true,
          bindings: [{ localName: 'AdminModule', importedName: 'AdminModule' }]
        }
      ]
    })
    const adminModule = routeFile({
      filePath: 'src/admin/admin.module.ts',
      moduleDescriptor: { controllers: [], routerRoutes: [] }
    })

    expect(collectServiceModuleNames([controller, adminModule])).toEqual([])
  })
})
