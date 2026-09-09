import ts from 'typescript-compiler-api'
import { describe, expect, it } from 'vitest'
import { collectNestEndpoints } from './nest-controller-collector'

function parse(source: string): ts.SourceFile {
  return ts.createSourceFile('test.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
}

describe('collectNestEndpoints', () => {
  it('joins the controller prefix with a string-literal method path', () => {
    const sourceFile = parse(
      ['@Controller("users")', 'class UsersController {', '  @Get(":id")', '  find() {}', '}'].join(
        '\n'
      )
    )
    expect(collectNestEndpoints(sourceFile)).toEqual([
      { method: 'GET', path: '/users/:id', routerLocalName: 'UsersController' }
    ])
  })

  it('treats an absent controller arg as an empty prefix and an absent method arg as the prefix itself', () => {
    const sourceFile = parse(
      ['@Controller("users")', 'class UsersController {', '  @Get()', '  list() {}', '}'].join('\n')
    )
    expect(collectNestEndpoints(sourceFile)).toEqual([
      { method: 'GET', path: '/users', routerLocalName: 'UsersController' }
    ])
  })

  it('resolves to "/" when both the controller and method args are absent', () => {
    const sourceFile = parse(
      ['@Controller()', 'class RootController {', '  @Get()', '  ping() {}', '}'].join('\n')
    )
    expect(collectNestEndpoints(sourceFile)).toEqual([
      { method: 'GET', path: '/', routerLocalName: 'RootController' }
    ])
  })

  it('uses the controller class name as routerLocalName', () => {
    const sourceFile = parse(
      ['@Controller("auth")', 'class AuthController {', '  @Get()', '  check() {}', '}'].join('\n')
    )
    expect(collectNestEndpoints(sourceFile)[0].routerLocalName).toBe('AuthController')
  })

  it('ignores classes without a @Controller decorator', () => {
    const sourceFile = parse(['class PlainService {', '  @Get()', '  find() {}', '}'].join('\n'))
    expect(collectNestEndpoints(sourceFile)).toEqual([])
  })

  const methodCases: [string, string][] = [
    ['Post', 'POST'],
    ['Put', 'PUT'],
    ['Patch', 'PATCH'],
    ['Delete', 'DELETE'],
    ['Options', 'OPTIONS'],
    ['Head', 'HEAD'],
    ['All', 'ALL']
  ]

  it.each(methodCases)('maps @%s to the %s method, uppercased', (decoratorName, httpMethod) => {
    const sourceFile = parse(
      [
        '@Controller("users")',
        'class UsersController {',
        `  @${decoratorName}()`,
        '  handle() {}',
        '}'
      ].join('\n')
    )
    expect(collectNestEndpoints(sourceFile)).toEqual([
      { method: httpMethod, path: '/users', routerLocalName: 'UsersController' }
    ])
  })

  it('reads the prefix from an object-literal @Controller({ path, host }) arg, ignoring host', () => {
    const sourceFile = parse(
      [
        '@Controller({ path: "users", host: "admin.example.com" })',
        'class UsersController {',
        '  @Get()',
        '  list() {}',
        '}'
      ].join('\n')
    )
    expect(collectNestEndpoints(sourceFile)).toEqual([
      { method: 'GET', path: '/users', routerLocalName: 'UsersController' }
    ])
  })

  it('produces one endpoint per controller-prefix array entry', () => {
    const sourceFile = parse(
      ['@Controller(["v1", "v2"])', 'class UsersController {', '  @Get()', '  list() {}', '}'].join(
        '\n'
      )
    )
    expect(collectNestEndpoints(sourceFile)).toEqual([
      { method: 'GET', path: '/v1', routerLocalName: 'UsersController' },
      { method: 'GET', path: '/v2', routerLocalName: 'UsersController' }
    ])
  })

  it('produces one endpoint per method-path array entry', () => {
    const sourceFile = parse(
      [
        '@Controller("users")',
        'class UsersController {',
        '  @Get(["a", "b"])',
        '  list() {}',
        '}'
      ].join('\n')
    )
    expect(collectNestEndpoints(sourceFile)).toEqual([
      { method: 'GET', path: '/users/a', routerLocalName: 'UsersController' },
      { method: 'GET', path: '/users/b', routerLocalName: 'UsersController' }
    ])
  })

  it('concatenates endpoints from multiple controllers in one file, in source order', () => {
    const sourceFile = parse(
      [
        '@Controller("users")',
        'class UsersController {',
        '  @Get()',
        '  list() {}',
        '}',
        '@Controller("auth")',
        'class AuthController {',
        '  @Post("login")',
        '  login() {}',
        '}'
      ].join('\n')
    )
    expect(collectNestEndpoints(sourceFile)).toEqual([
      { method: 'GET', path: '/users', routerLocalName: 'UsersController' },
      { method: 'POST', path: '/auth/login', routerLocalName: 'AuthController' }
    ])
  })

  it('degrades a non-literal controller prefix to the dynamic-path marker', () => {
    const sourceFile = parse(
      [
        'const prefix = computePrefix()',
        '@Controller(prefix)',
        'class UsersController {',
        '  @Get(":id")',
        '  find() {}',
        '}'
      ].join('\n')
    )
    expect(collectNestEndpoints(sourceFile)).toEqual([
      { method: 'GET', path: '<dynamic>/:id', routerLocalName: 'UsersController' }
    ])
  })

  it('degrades a non-literal method path to the dynamic-path marker', () => {
    const sourceFile = parse(
      [
        'const suffix = computeSuffix()',
        '@Controller("users")',
        'class UsersController {',
        '  @Get(suffix)',
        '  find() {}',
        '}'
      ].join('\n')
    )
    expect(collectNestEndpoints(sourceFile)).toEqual([
      { method: 'GET', path: '/users<dynamic>', routerLocalName: 'UsersController' }
    ])
  })
})
