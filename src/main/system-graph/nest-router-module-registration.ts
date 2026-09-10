import ts from 'typescript-compiler-api'
import { DYNAMIC_PATH, stringLiteralValues } from './route-call-ast'

const MODULE_DECORATOR_NAME = 'Module'
const ROUTER_MODULE_NAME = 'RouterModule'
const REGISTER_METHOD_NAME = 'register'

export type RouterModuleRoute = {
  path: string
  moduleLocalName: string
  children: RouterModuleRoute[]
}

export type NestModuleDescriptor = {
  controllers: string[]
  routerRoutes: RouterModuleRoute[]
}

function decoratorName(decorator: ts.Decorator): string | null {
  const callee = ts.isCallExpression(decorator.expression)
    ? decorator.expression.expression
    : decorator.expression
  return ts.isIdentifier(callee) ? callee.text : null
}

function decoratorArg(decorator: ts.Decorator): ts.Expression | undefined {
  return ts.isCallExpression(decorator.expression) ? decorator.expression.arguments[0] : undefined
}

/** Walks the whole file for the first `@Module(...)`-decorated class, in source order. */
function findModuleDecorator(sourceFile: ts.SourceFile): ts.Decorator | undefined {
  let found: ts.Decorator | undefined
  const visit = (node: ts.Node): void => {
    if (found) {
      return
    }
    if (ts.isClassDeclaration(node) && ts.canHaveDecorators(node)) {
      found = (ts.getDecorators(node) ?? []).find((d) => decoratorName(d) === MODULE_DECORATOR_NAME)
      if (found) {
        return
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return found
}

function objectLiteralProperty(
  obj: ts.ObjectLiteralExpression,
  name: string
): ts.PropertyAssignment | undefined {
  return obj.properties.find(
    (p): p is ts.PropertyAssignment =>
      ts.isPropertyAssignment(p) && ts.isIdentifier(p.name) && p.name.text === name
  )
}

/** `controllers: [Identifier, ...]` -> class names; a non-identifier element is dropped. */
function collectControllerNames(controllersProp: ts.PropertyAssignment | undefined): string[] {
  if (!controllersProp || !ts.isArrayLiteralExpression(controllersProp.initializer)) {
    return []
  }
  return controllersProp.initializer.elements.filter(ts.isIdentifier).map((el) => el.text)
}

function isRouterModuleRegisterCall(node: ts.Expression): node is ts.CallExpression {
  return (
    ts.isCallExpression(node) &&
    ts.isPropertyAccessExpression(node.expression) &&
    ts.isIdentifier(node.expression.expression) &&
    node.expression.expression.text === ROUTER_MODULE_NAME &&
    ts.isIdentifier(node.expression.name) &&
    node.expression.name.text === REGISTER_METHOD_NAME
  )
}

/** Finds the first `RouterModule.register([...])` call anywhere in an `imports: [...]` array. */
function findRouterModuleRegisterCall(
  importsProp: ts.PropertyAssignment | undefined
): ts.CallExpression | undefined {
  if (!importsProp || !ts.isArrayLiteralExpression(importsProp.initializer)) {
    return undefined
  }
  return importsProp.initializer.elements.find(isRouterModuleRegisterCall) as
    | ts.CallExpression
    | undefined
}

function resolveRoutePath(arg: ts.Expression | undefined): string {
  if (!arg) {
    return ''
  }
  const literals = stringLiteralValues(arg)
  return literals.length > 0 ? literals[0] : DYNAMIC_PATH
}

/** One `{ path, module, children? }` object literal -> a route, or undefined when `module`
 * isn't a plain identifier (dropped — nothing resolvable to a cross-file module target). */
function parseRouteEntry(entry: ts.Expression): RouterModuleRoute | undefined {
  if (!ts.isObjectLiteralExpression(entry)) {
    return undefined
  }
  const moduleProp = objectLiteralProperty(entry, 'module')
  if (!moduleProp || !ts.isIdentifier(moduleProp.initializer)) {
    return undefined
  }
  const pathProp = objectLiteralProperty(entry, 'path')
  const childrenProp = objectLiteralProperty(entry, 'children')
  const children =
    childrenProp && ts.isArrayLiteralExpression(childrenProp.initializer)
      ? childrenProp.initializer.elements
          .map(parseRouteEntry)
          .filter((r): r is RouterModuleRoute => !!r)
      : []
  return {
    path: resolveRoutePath(pathProp?.initializer),
    moduleLocalName: moduleProp.initializer.text,
    children
  }
}

function collectRouterRoutes(registerCall: ts.CallExpression | undefined): RouterModuleRoute[] {
  const arg = registerCall?.arguments[0]
  if (!arg || !ts.isArrayLiteralExpression(arg)) {
    return []
  }
  return arg.elements.map(parseRouteEntry).filter((r): r is RouterModuleRoute => !!r)
}

/** Finds the first `@Module({...})` class decorator in a Nest source file and extracts its
 * `controllers` array and any `RouterModule.register([...])` tree nested in `imports`.
 * undefined when the file has no `@Module` decorator at all. */
export function collectModuleDescriptor(
  sourceFile: ts.SourceFile
): NestModuleDescriptor | undefined {
  const decorator = findModuleDecorator(sourceFile)
  if (!decorator) {
    return undefined
  }
  const arg = decoratorArg(decorator)
  if (!arg || !ts.isObjectLiteralExpression(arg)) {
    return { controllers: [], routerRoutes: [] }
  }
  return {
    controllers: collectControllerNames(objectLiteralProperty(arg, 'controllers')),
    routerRoutes: collectRouterRoutes(
      findRouterModuleRegisterCall(objectLiteralProperty(arg, 'imports'))
    )
  }
}
