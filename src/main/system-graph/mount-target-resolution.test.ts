import ts from 'typescript-compiler-api'
import { describe, expect, it } from 'vitest'
import { resolveMountTargetArg } from './mount-target-resolution'

const FILE = 'src/app.ts'
const NO_NAMESPACES = new Map<string, string>()

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
    if (
      ts.isCallExpression(node) &&
      !found &&
      node.expression.kind !== ts.SyntaxKind.ImportKeyword
    ) {
      found = node.arguments[0]
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return found
}

function syntheticLocalName(): () => string {
  let n = 0
  return () => `__mountTarget${n++}`
}

describe('resolveMountTargetArg: identifier and absent-argument shapes', () => {
  it('returns null for a missing argument', () => {
    expect(resolveMountTargetArg(undefined, NO_NAMESPACES, syntheticLocalName())).toBeNull()
  })

  it('resolves a bare identifier to an identifier ref', () => {
    const arg = firstCallArg('register(plugin)')!
    expect(resolveMountTargetArg(arg, NO_NAMESPACES, syntheticLocalName())).toEqual({
      kind: 'identifier',
      name: 'plugin'
    })
  })

  it('returns null for a non-identifier, non-call argument', () => {
    const arg = firstCallArg("register('not-a-target')")!
    expect(resolveMountTargetArg(arg, NO_NAMESPACES, syntheticLocalName())).toBeNull()
  })
})

describe('resolveMountTargetArg: dynamic import() and require() targets', () => {
  it('resolves import(...) to a moduleBinding with importedName default', () => {
    const arg = firstCallArg("register(import('./routes/orders'))")!
    expect(resolveMountTargetArg(arg, NO_NAMESPACES, syntheticLocalName())).toEqual({
      kind: 'moduleBinding',
      localName: '__mountTarget0',
      moduleSpecifier: './routes/orders',
      importedName: 'default'
    })
  })

  it('resolves await import(...) to the same moduleBinding shape', () => {
    const arg = firstCallArg("register(await import('./routes/orders'))")!
    expect(resolveMountTargetArg(arg, NO_NAMESPACES, syntheticLocalName())).toEqual({
      kind: 'moduleBinding',
      localName: '__mountTarget0',
      moduleSpecifier: './routes/orders',
      importedName: 'default'
    })
  })

  it('resolves require(...) to the same moduleBinding shape', () => {
    const arg = firstCallArg("register(require('./routes/orders'))")!
    expect(resolveMountTargetArg(arg, NO_NAMESPACES, syntheticLocalName())).toEqual({
      kind: 'moduleBinding',
      localName: '__mountTarget0',
      moduleSpecifier: './routes/orders',
      importedName: 'default'
    })
  })
})

describe('resolveMountTargetArg: one wrapper-call level', () => {
  it('unwraps fp(identifier) to the identifier ref', () => {
    const arg = firstCallArg('register(fp(plugin))')!
    expect(resolveMountTargetArg(arg, NO_NAMESPACES, syntheticLocalName())).toEqual({
      kind: 'identifier',
      name: 'plugin'
    })
  })

  it("unwraps fp(import('./x')) to a moduleBinding", () => {
    const arg = firstCallArg("register(fp(import('./routes/orders')))")!
    expect(resolveMountTargetArg(arg, NO_NAMESPACES, syntheticLocalName())).toEqual({
      kind: 'moduleBinding',
      localName: '__mountTarget0',
      moduleSpecifier: './routes/orders',
      importedName: 'default'
    })
  })

  it('returns null for a two-level wrapper call', () => {
    const arg = firstCallArg('register(fp(bar(plugin)))')!
    expect(resolveMountTargetArg(arg, NO_NAMESPACES, syntheticLocalName())).toBeNull()
  })
})

describe('resolveMountTargetArg: namespace-import property access', () => {
  it('resolves ns.default to a moduleBinding importedName default', () => {
    const namespaces = new Map([['auth', './routes/auth']])
    const arg = firstCallArg('register(auth.default)')!
    expect(resolveMountTargetArg(arg, namespaces, syntheticLocalName())).toEqual({
      kind: 'moduleBinding',
      localName: '__mountTarget0',
      moduleSpecifier: './routes/auth',
      importedName: 'default'
    })
  })

  it('resolves ns.prop to a moduleBinding importedName matching the property', () => {
    const namespaces = new Map([['users', './routes/users']])
    const arg = firstCallArg('register(users.router)')!
    expect(resolveMountTargetArg(arg, namespaces, syntheticLocalName())).toEqual({
      kind: 'moduleBinding',
      localName: '__mountTarget0',
      moduleSpecifier: './routes/users',
      importedName: 'router'
    })
  })

  it('unwraps fp(ns.default) to the same moduleBinding shape', () => {
    const namespaces = new Map([['auth', './routes/auth']])
    const arg = firstCallArg('register(fp(auth.default))')!
    expect(resolveMountTargetArg(arg, namespaces, syntheticLocalName())).toEqual({
      kind: 'moduleBinding',
      localName: '__mountTarget0',
      moduleSpecifier: './routes/auth',
      importedName: 'default'
    })
  })

  it('returns null for a property access on an unknown namespace', () => {
    const arg = firstCallArg('register(unknownNs.default)')!
    expect(resolveMountTargetArg(arg, NO_NAMESPACES, syntheticLocalName())).toBeNull()
  })

  it('returns null for a nested property access (ns.sub.prop)', () => {
    const namespaces = new Map([['ns', './routes/ns']])
    const arg = firstCallArg('register(ns.sub.prop)')!
    expect(resolveMountTargetArg(arg, namespaces, syntheticLocalName())).toBeNull()
  })
})
