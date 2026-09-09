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
})
