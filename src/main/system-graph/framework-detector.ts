import type { WorktreeSourceReader } from './worktree-source-reader'

export type EngineFramework = 'express' | 'fastify'

const EXPRESS_DEP_NAMES = ['express', '@types/express']
const FASTIFY_DEP_NAMES = ['fastify']
const FASTIFY_SCOPE_PREFIX = '@fastify/'
const TYPESCRIPT_DEP_NAMES = ['typescript']

function hasAnyDependency(deps: unknown, names: readonly string[]): boolean {
  if (!deps || typeof deps !== 'object') {
    return false
  }
  return names.some((name) => name in (deps as Record<string, unknown>))
}

function hasDependencyPrefix(deps: unknown, prefix: string): boolean {
  if (!deps || typeof deps !== 'object') {
    return false
  }
  return Object.keys(deps as Record<string, unknown>).some((name) => name.startsWith(prefix))
}

function hasDependencyEither(packageJson: PackageJsonShape, names: readonly string[]): boolean {
  return (
    hasAnyDependency(packageJson.dependencies, names) ||
    hasAnyDependency(packageJson.devDependencies, names)
  )
}

function hasDependencyPrefixEither(packageJson: PackageJsonShape, prefix: string): boolean {
  return (
    hasDependencyPrefix(packageJson.dependencies, prefix) ||
    hasDependencyPrefix(packageJson.devDependencies, prefix)
  )
}

type PackageJsonShape = { dependencies?: unknown; devDependencies?: unknown }

function asPackageJsonShape(packageJson: unknown): PackageJsonShape {
  return packageJson && typeof packageJson === 'object' ? (packageJson as PackageJsonShape) : {}
}

async function hasTsFilesAtRoot(reader: WorktreeSourceReader): Promise<boolean> {
  const entries = await reader.listDir('.')
  return entries.some((entry) => !entry.isDirectory && entry.name.endsWith('.ts'))
}

async function hasTsSignal(
  reader: WorktreeSourceReader,
  packageJson: PackageJsonShape
): Promise<boolean> {
  return (
    (await reader.readFileText('tsconfig.json')) !== null ||
    hasDependencyEither(packageJson, TYPESCRIPT_DEP_NAMES) ||
    (await hasTsFilesAtRoot(reader))
  )
}

// Why: Express is checked first (D7-precedent) so existing Express repos keep resolving
// through the same branch/laziness even now that Fastify is also recognized.
export async function detectFramework(
  reader: WorktreeSourceReader
): Promise<EngineFramework | null> {
  const packageJson = asPackageJsonShape(await reader.readPackageJson())

  if (hasDependencyEither(packageJson, EXPRESS_DEP_NAMES)) {
    return (await hasTsSignal(reader, packageJson)) ? 'express' : null
  }

  if (
    hasDependencyEither(packageJson, FASTIFY_DEP_NAMES) ||
    hasDependencyPrefixEither(packageJson, FASTIFY_SCOPE_PREFIX)
  ) {
    return (await hasTsSignal(reader, packageJson)) ? 'fastify' : null
  }

  return null
}
