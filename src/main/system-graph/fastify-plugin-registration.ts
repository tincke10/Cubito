import ts from 'typescript-compiler-api'
import { collectFastifyEndpoints } from './fastify-endpoint-collector'
import type { ParsedEndpoint, ParsedRouterMount } from './framework-route-model'
import { calleeParts } from './route-call-ast'

type PluginDefinition = { name: string; firstParamName: string; body: ts.Node }

function firstParamName(fn: { parameters: ts.NodeArray<ts.ParameterDeclaration> }): string | null {
  const param = fn.parameters[0]
  return param && ts.isIdentifier(param.name) ? param.name.text : null
}

/** Finds every named function in the file shaped like a Fastify plugin (function
 * declaration, or a const bound to a function/arrow expression), keyed by the
 * identifier other code references it by. */
function collectPluginDefinitions(sourceFile: ts.SourceFile): Map<string, PluginDefinition> {
  const plugins = new Map<string, PluginDefinition>()
  const visit = (node: ts.Node): void => {
    if (ts.isFunctionDeclaration(node) && node.name && node.body) {
      const param = firstParamName(node)
      if (param) {
        plugins.set(node.name.text, {
          name: node.name.text,
          firstParamName: param,
          body: node.body
        })
      }
    } else if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      (ts.isFunctionExpression(node.initializer) || ts.isArrowFunction(node.initializer))
    ) {
      const param = firstParamName(node.initializer)
      if (param) {
        plugins.set(node.name.text, {
          name: node.name.text,
          firstParamName: param,
          body: node.initializer.body
        })
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return plugins
}

/** Unwraps `.register(pluginLocal, ...)` and `.register(fp(pluginLocal), ...)` to the
 * referenced plugin identifier. Any single-argument call wrapping an identifier is
 * unwrapped — the wrapper's own name (conventionally fastify-plugin's `fp`) is never
 * checked, consistent with this parser's no-name-check looseness elsewhere. */
function pluginIdentifierName(arg: ts.Expression | undefined): string | null {
  if (!arg) {
    return null
  }
  if (ts.isIdentifier(arg)) {
    return arg.text
  }
  if (ts.isCallExpression(arg) && arg.arguments.length === 1 && ts.isIdentifier(arg.arguments[0])) {
    return (arg.arguments[0] as ts.Identifier).text
  }
  return null
}

function extractPrefix(optionsArg: ts.Expression | undefined): string | null {
  if (!optionsArg || !ts.isObjectLiteralExpression(optionsArg)) {
    return null
  }
  for (const prop of optionsArg.properties) {
    if (
      ts.isPropertyAssignment(prop) &&
      ts.isIdentifier(prop.name) &&
      prop.name.text === 'prefix' &&
      ts.isStringLiteralLike(prop.initializer)
    ) {
      return prop.initializer.text
    }
  }
  return null
}

/** Resolves same-file `instance.register(plugin, { prefix })` calls into mounts, and
 * collects the endpoints declared inside each registered plugin's body under the
 * plugin's OWN name — never its first-parameter name — so composeEndpointPath's
 * mount-chain walk (keyed by routerLocalName) reaches them unchanged. */
export function collectPluginRegistrations(
  sourceFile: ts.SourceFile,
  instanceLocals: ReadonlySet<string>
): { mounts: ParsedRouterMount[]; pluginEndpoints: ParsedEndpoint[] } {
  const plugins = collectPluginDefinitions(sourceFile)
  const mounts: ParsedRouterMount[] = []
  const registeredPluginNames = new Set<string>()

  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const parts = calleeParts(node.expression)
      if (parts && instanceLocals.has(parts.objectName) && parts.methodName === 'register') {
        const [pluginArg, optionsArg] = node.arguments
        const pluginName = pluginIdentifierName(pluginArg)
        if (pluginName && plugins.has(pluginName)) {
          const prefix = extractPrefix(optionsArg)
          if (prefix !== null) {
            mounts.push({ prefix, routerLocalName: pluginName, parentLocalName: parts.objectName })
          }
          registeredPluginNames.add(pluginName)
        }
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)

  const pluginEndpoints: ParsedEndpoint[] = []
  for (const pluginName of registeredPluginNames) {
    const plugin = plugins.get(pluginName) as PluginDefinition
    pluginEndpoints.push(
      ...collectFastifyEndpoints(plugin.body, new Set([plugin.firstParamName]), () => plugin.name)
    )
  }

  return { mounts, pluginEndpoints }
}
