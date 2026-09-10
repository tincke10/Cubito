import { describe, expect, it } from 'vitest'
import { nestRouteParser, parseNestRoutes } from './nest-route-parser'

describe('parseNestRoutes', () => {
  it('has framework "nest"', () => {
    expect(nestRouteParser.framework).toBe('nest')
  })

  it('never populates mounts', () => {
    const result = parseNestRoutes(
      ['@Controller("users")', 'class UsersController {', '  @Get()', '  list() {}', '}'].join(
        '\n'
      ),
      'src/users/users.controller.ts'
    )
    expect(result.mounts).toEqual([])
  })

  it('sets routerLocalName to the controller class name and uppercases the method', () => {
    const result = parseNestRoutes(
      ['@Controller("users")', 'class UsersController {', '  @Get(":id")', '  find() {}', '}'].join(
        '\n'
      ),
      'src/users/users.controller.ts'
    )
    expect(result.endpoints).toEqual([
      { method: 'GET', path: '/users/:id', routerLocalName: 'UsersController' }
    ])
  })

  it('collects imports and exports via the shared framework-neutral collectors', () => {
    const result = parseNestRoutes(
      [
        "import { Controller, Get } from '@nestjs/common'",
        "import { UsersService } from './users.service'",
        '@Controller("users")',
        'class UsersController {',
        '  @Get()',
        '  list() {}',
        '}',
        'export { UsersController }'
      ].join('\n'),
      'src/users/users.controller.ts'
    )
    expect(result.imports).toContainEqual({
      moduleSpecifier: './users.service',
      isRelative: true,
      bindings: [{ localName: 'UsersService', importedName: 'UsersService' }]
    })
    expect(result.exports).toContainEqual({
      localName: 'UsersController',
      exportedName: 'UsersController'
    })
  })

  it('returns an empty result for a file with no controller', () => {
    const result = parseNestRoutes('export const x = 1', 'src/plain.ts')
    expect(result).toEqual({
      filePath: 'src/plain.ts',
      endpoints: [],
      mounts: [],
      imports: [],
      exports: [{ localName: 'x', exportedName: 'x' }]
    })
  })

  it('sets globalPrefix when the file calls setGlobalPrefix', () => {
    const result = parseNestRoutes(
      [
        'async function bootstrap() {',
        '  const app = await NestFactory.create(AppModule)',
        "  app.setGlobalPrefix('api')",
        '}'
      ].join('\n'),
      'src/main.ts'
    )
    expect(result.globalPrefix).toBe('/api')
  })

  it('omits globalPrefix (not undefined-valued) when the file has no setGlobalPrefix call', () => {
    const result = parseNestRoutes(
      ['@Controller("users")', 'class UsersController {', '  @Get()', '  list() {}', '}'].join(
        '\n'
      ),
      'src/users/users.controller.ts'
    )
    expect('globalPrefix' in result).toBe(false)
  })

  it('sets moduleDescriptor when the file has an @Module decorator', () => {
    const result = parseNestRoutes(
      [
        '@Module({',
        '  controllers: [UsersController, AuthController]',
        '})',
        'export class AppModule {}'
      ].join('\n'),
      'src/app.module.ts'
    )
    expect(result.moduleDescriptor).toEqual({
      controllers: ['UsersController', 'AuthController'],
      routerRoutes: []
    })
  })

  it('omits moduleDescriptor (not undefined-valued) when the file has no @Module decorator', () => {
    const result = parseNestRoutes(
      ['@Controller("users")', 'class UsersController {', '  @Get()', '  list() {}', '}'].join(
        '\n'
      ),
      'src/users/users.controller.ts'
    )
    expect('moduleDescriptor' in result).toBe(false)
  })
})
