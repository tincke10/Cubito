import type { WorktreeSourceReader } from './worktree-source-reader'

export type EngineFramework = 'express'

const EXPRESS_DEP_NAMES = ['express', '@types/express']
const TYPESCRIPT_DEP_NAMES = ['typescript']

function hasAnyDependency(deps: unknown, names: readonly string[]): boolean {
  if (!deps || typeof deps !== 'object') {
    return false
  }
  return names.some((name) => name in (deps as Record<string, unknown>))
}

function hasDependencyEither(packageJson: PackageJsonShape, names: readonly string[]): boolean {
  return (
    hasAnyDependency(packageJson.dependencies, names) ||
    hasAnyDependency(packageJson.devDependencies, names)
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

// Why: Change A only supports Express+TS (D7) — anything else stays a graceful null (empty graph).
export async function detectFramework(
  reader: WorktreeSourceReader
): Promise<EngineFramework | null> {
  const packageJson = asPackageJsonShape(await reader.readPackageJson())
  if (!hasDependencyEither(packageJson, EXPRESS_DEP_NAMES)) {
    return null
  }
  const hasTsSignal =
    (await reader.readFileText('tsconfig.json')) !== null ||
    hasDependencyEither(packageJson, TYPESCRIPT_DEP_NAMES) ||
    (await hasTsFilesAtRoot(reader))
  return hasTsSignal ? 'express' : null
}
