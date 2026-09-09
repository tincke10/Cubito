import ts from 'typescript-compiler-api'
import { describe, expect, it } from 'vitest'
import {
  DYNAMIC_PATH,
  HTTP_ROUTE_METHODS,
  calleeParts,
  collectExports,
  collectImports,
  collectNamespaceImportLocalNames,
  isBareIdentifierCall,
  resolvePathArg
} from './route-call-ast'

const FILE = 'src/routes.ts'

function parse(source: string): ts.SourceFile {
  return ts.createSourceFile(FILE, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
}

function firstCallArg(source: string): ts.Expression | undefined {
  const sourceFile = ts.createSourceFile(
    FILE,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  )
  let found: ts.Expression | undefined
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && !found) {
      found = node.arguments[0]
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return found
}

function firstCallExpression(source: string): ts.CallExpression | undefined {
  const sourceFile = ts.createSourceFile(
    FILE,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  )
  let found: ts.CallExpression | undefined
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && !found) {
      found = node
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return found
}

describe('resolvePathArg', () => {
  it('returns the literal text for a string literal argument', () => {
    expect(resolvePathArg(firstCallArg("f('/users')"))).toBe('/users')
  })

  it('returns DYNAMIC_PATH for a missing argument', () => {
    expect(resolvePathArg(undefined)).toBe(DYNAMIC_PATH)
  })

  it('returns DYNAMIC_PATH for a non-literal argument', () => {
    expect(resolvePathArg(firstCallArg('f(computePath())'))).toBe(DYNAMIC_PATH)
  })

  it('returns the literal text for a no-substitution template literal (characterization)', () => {
    expect(resolvePathArg(firstCallArg('f(`/users`)'))).toBe('/users')
  })

  it('returns DYNAMIC_PATH for a template literal with a substitution', () => {
    expect(resolvePathArg(firstCallArg('f(`/users/${id}`)'))).toBe(DYNAMIC_PATH)
  })
})

describe('calleeParts', () => {
  it('extracts objectName/methodName from a property access callee', () => {
    const call = firstCallExpression("app.get('/x', h)")!
    expect(calleeParts(call.expression)).toEqual({ objectName: 'app', methodName: 'get' })
  })

  it('returns null when the callee object is not a plain identifier', () => {
    const call = firstCallExpression("app.sub.get('/x', h)")!
    expect(calleeParts(call.expression)).toBeNull()
  })

  it('returns null for a bare identifier callee (no property access)', () => {
    const call = firstCallExpression('standalone()')!
    expect(calleeParts(call.expression)).toBeNull()
  })
})

describe('collectImports', () => {
  it('flags relative and package imports', () => {
    const source = `
      import { router } from './routes/users'
      import express from 'express'
    `
    expect(collectImports(parse(source))).toEqual([
      {
        moduleSpecifier: './routes/users',
        isRelative: true,
        bindings: [{ localName: 'router', importedName: 'router' }]
      },
      {
        moduleSpecifier: 'express',
        isRelative: false,
        bindings: [{ localName: 'express', importedName: 'default' }]
      }
    ])
  })

  it('captures a default import aliased locally alongside a renamed named import', () => {
    const source = "import Users, { auth as authRouter } from './routes'"
    expect(collectImports(parse(source))).toEqual([
      {
        moduleSpecifier: './routes',
        isRelative: true,
        bindings: [
          { localName: 'Users', importedName: 'default' },
          { localName: 'authRouter', importedName: 'auth' }
        ]
      }
    ])
  })

  it('captures a namespace import', () => {
    const source = "import * as routes from './routes'"
    expect(collectImports(parse(source))).toEqual([
      {
        moduleSpecifier: './routes',
        isRelative: true,
        bindings: [{ localName: 'routes', importedName: '*' }]
      }
    ])
  })
})

describe('collectNamespaceImportLocalNames', () => {
  it('maps a namespace-import local name to its relative module specifier', () => {
    const source = "import * as auth from './routes/auth'"
    expect(collectNamespaceImportLocalNames(parse(source))).toEqual(
      new Map([['auth', './routes/auth']])
    )
  })

  it('ignores a non-relative namespace import', () => {
    const source = "import * as path from 'node:path'"
    expect(collectNamespaceImportLocalNames(parse(source))).toEqual(new Map())
  })

  it('ignores a default or named import (no namespace binding)', () => {
    const source = "import Users, { auth } from './routes'"
    expect(collectNamespaceImportLocalNames(parse(source))).toEqual(new Map())
  })
})

describe('collectExports', () => {
  it('captures a default export of an identifier', () => {
    const source = `
      const router = express.Router()
      export default router
    `
    expect(collectExports(parse(source))).toEqual([
      { localName: 'router', exportedName: 'default' }
    ])
  })

  it('captures a named export of a const declaration', () => {
    const source = 'export const usersRouter = express.Router()'
    expect(collectExports(parse(source))).toEqual([
      { localName: 'usersRouter', exportedName: 'usersRouter' }
    ])
  })

  it('captures an exported named function declaration', () => {
    const source = 'export async function usersPlugin(fastify, opts) {}'
    expect(collectExports(parse(source))).toEqual([
      { localName: 'usersPlugin', exportedName: 'usersPlugin' }
    ])
  })

  it('captures a default-exported named function declaration', () => {
    const source = 'export default async function usersPlugin(fastify, opts) {}'
    expect(collectExports(parse(source))).toEqual([
      { localName: 'usersPlugin', exportedName: 'default' }
    ])
  })

  it('captures a re-export list with an alias', () => {
    const source = 'const a = 1\nexport { a as b }'
    expect(collectExports(parse(source))).toEqual([{ localName: 'a', exportedName: 'b' }])
  })

  it('returns an empty array when nothing is exported', () => {
    expect(collectExports(parse('const app = express()'))).toEqual([])
  })
})

describe('isBareIdentifierCall', () => {
  it('returns true for a call whose callee is a plain identifier', () => {
    expect(isBareIdentifierCall(firstCallExpression('fastify()')!)).toBe(true)
  })

  it('returns false for a property-access callee', () => {
    expect(isBareIdentifierCall(firstCallExpression('express.Router()')!)).toBe(false)
  })
})

describe('HTTP_ROUTE_METHODS', () => {
  it('contains every recognized HTTP verb', () => {
    expect([...HTTP_ROUTE_METHODS].sort()).toEqual(
      ['all', 'delete', 'get', 'head', 'options', 'patch', 'post', 'put'].sort()
    )
  })
})
