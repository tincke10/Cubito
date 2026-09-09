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
})
