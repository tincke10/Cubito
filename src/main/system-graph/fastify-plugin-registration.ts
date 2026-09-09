import ts from 'typescript-compiler-api'
import { collectFastifyEndpoints } from './fastify-endpoint-collector'
import type { ParsedEndpoint, ParsedImport, ParsedRouterMount } from './framework-route-model'
import { resolveMountTargetArg } from './mount-target-resolution'
import {
  calleeParts,
  collectExports,
  collectNamespaceImportLocalNames,
  collectRelativeImportLocalNames
} from './route-call-ast'

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

/** Resolves `instance.register(plugin, { prefix })` calls into mounts — the plugin may be
 * declared in this same file OR bound by a relative import (the dominant real-world layout,
 * where a route file just declares + exports its plugin and never registers itself) — and
 * collects the endpoints declared inside each LOCALLY-defined registered plugin's body under
 * the plugin's OWN name — never its first-parameter name — so composeEndpointPath's mount-chain
 * walk (keyed by routerLocalName) reaches them unchanged. A plugin exported from this file also
 * gets its endpoints collected even with no same-file .register() call, since a cross-file
 * caller resolves it by that same exported name (route-mount-composition.ts). */
export function collectPluginRegistrations(
  sourceFile: ts.SourceFile,
  instanceLocals: ReadonlySet<string>
): {
  mounts: ParsedRouterMount[]
  pluginEndpoints: ParsedEndpoint[]
  syntheticImports: ParsedImport[]
} {
  const plugins = collectPluginDefinitions(sourceFile)
  const relativeImportLocalNames = collectRelativeImportLocalNames(sourceFile)
  const namespaceImportLocalNames = collectNamespaceImportLocalNames(sourceFile)
  const mounts: ParsedRouterMount[] = []
  const syntheticImports: ParsedImport[] = []
  const activePluginNames = new Set<string>()
  let syntheticCounter = 0
  const nextSyntheticLocalName = (): string => `__dynamicPluginTarget${syntheticCounter++}`

  for (const exported of collectExports(sourceFile)) {
    if (plugins.has(exported.localName)) {
      activePluginNames.add(exported.localName)
    }
  }

  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const parts = calleeParts(node.expression)
      if (parts && instanceLocals.has(parts.objectName) && parts.methodName === 'register') {
        const [pluginArg, optionsArg] = node.arguments
        const target = resolveMountTargetArg(
          pluginArg,
          namespaceImportLocalNames,
          nextSyntheticLocalName
        )
        if (target?.kind === 'identifier') {
          const pluginName = target.name
          const isLocalPlugin = plugins.has(pluginName)
          const isImportedPlugin = relativeImportLocalNames.has(pluginName)
          if (isLocalPlugin || isImportedPlugin) {
            const prefix = extractPrefix(optionsArg)
            if (prefix !== null) {
              mounts.push({
                prefix,
                routerLocalName: pluginName,
                parentLocalName: parts.objectName
              })
            }
            if (isLocalPlugin) {
              activePluginNames.add(pluginName)
            }
          }
        } else if (target?.kind === 'moduleBinding') {
          syntheticImports.push({
            moduleSpecifier: target.moduleSpecifier,
            isRelative: target.moduleSpecifier.startsWith('.'),
            bindings: [{ localName: target.localName, importedName: target.importedName }]
          })
          const prefix = extractPrefix(optionsArg)
          if (prefix !== null) {
            mounts.push({
              prefix,
              routerLocalName: target.localName,
              parentLocalName: parts.objectName
            })
          }
        }
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)

  const pluginEndpoints: ParsedEndpoint[] = []
  for (const pluginName of activePluginNames) {
    const plugin = plugins.get(pluginName) as PluginDefinition
    pluginEndpoints.push(
      ...collectFastifyEndpoints(plugin.body, new Set([plugin.firstParamName]), () => plugin.name)
    )
  }

  return { mounts, pluginEndpoints, syntheticImports }
}
