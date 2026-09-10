import ts from 'typescript-compiler-api'
import { describe, expect, it } from 'vitest'
import { collectModuleDescriptor } from './nest-router-module-registration'

function parse(source: string): ts.SourceFile {
  return ts.createSourceFile('test.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
}

describe('collectModuleDescriptor', () => {
  it('returns undefined for a file with no @Module decorator', () => {
    const sourceFile = parse(['class PlainService {', '  find() {}', '}'].join('\n'))
    expect(collectModuleDescriptor(sourceFile)).toBeUndefined()
  })

  it('reads an empty grouping module (no controllers, no imports)', () => {
    const sourceFile = parse(['@Module({})', 'export class AdminModule {}'].join('\n'))
    expect(collectModuleDescriptor(sourceFile)).toEqual({ controllers: [], routerRoutes: [] })
  })

  it('extracts the controllers array of identifiers', () => {
    const sourceFile = parse(
      [
        '@Module({',
        '  controllers: [UsersController, AuthController]',
        '})',
        'export class AppModule {}'
      ].join('\n')
    )
    expect(collectModuleDescriptor(sourceFile)).toEqual({
      controllers: ['UsersController', 'AuthController'],
      routerRoutes: []
    })
  })

  it('drops non-identifier elements from the controllers array', () => {
    const sourceFile = parse(
      [
        '@Module({',
        "  controllers: [UsersController, 'not-an-identifier']",
        '})',
        'export class AppModule {}'
      ].join('\n')
    )
    expect(collectModuleDescriptor(sourceFile)).toEqual({
      controllers: ['UsersController'],
      routerRoutes: []
    })
  })

  it('parses a single-level RouterModule.register route', () => {
    const sourceFile = parse(
      [
        '@Module({',
        '  imports: [RouterModule.register([{ path: "admin", module: AdminModule }])]',
        '})',
        'export class AppModule {}'
      ].join('\n')
    )
    expect(collectModuleDescriptor(sourceFile)).toEqual({
      controllers: [],
      routerRoutes: [{ path: 'admin', moduleLocalName: 'AdminModule', children: [] }]
    })
  })

  it('recursively parses nested children route entries', () => {
    const sourceFile = parse(
      [
        '@Module({',
        '  imports: [RouterModule.register([',
        '    { path: "admin", module: AdminModule, children: [',
        '      { path: "users", module: AdminUsersModule }',
        '    ] }',
        '  ])]',
        '})',
        'export class AppModule {}'
      ].join('\n')
    )
    expect(collectModuleDescriptor(sourceFile)).toEqual({
      controllers: [],
      routerRoutes: [
        {
          path: 'admin',
          moduleLocalName: 'AdminModule',
          children: [{ path: 'users', moduleLocalName: 'AdminUsersModule', children: [] }]
        }
      ]
    })
  })

  it('drops a route entry whose module value is not a plain identifier', () => {
    const sourceFile = parse(
      [
        '@Module({',
        '  imports: [RouterModule.register([{ path: "admin", module: computeModule() }])]',
        '})',
        'export class AppModule {}'
      ].join('\n')
    )
    expect(collectModuleDescriptor(sourceFile)).toEqual({ controllers: [], routerRoutes: [] })
  })

  it('degrades a non-literal path to the dynamic-path marker', () => {
    const sourceFile = parse(
      [
        '@Module({',
        '  imports: [RouterModule.register([{ path: computePath(), module: AdminModule }])]',
        '})',
        'export class AppModule {}'
      ].join('\n')
    )
    expect(collectModuleDescriptor(sourceFile)).toEqual({
      controllers: [],
      routerRoutes: [{ path: '<dynamic>', moduleLocalName: 'AdminModule', children: [] }]
    })
  })

  it('treats a missing imports array as no router routes', () => {
    const sourceFile = parse(
      ['@Module({', '  controllers: [UsersController]', '})', 'export class AppModule {}'].join(
        '\n'
      )
    )
    expect(collectModuleDescriptor(sourceFile)).toEqual({
      controllers: ['UsersController'],
      routerRoutes: []
    })
  })
})
