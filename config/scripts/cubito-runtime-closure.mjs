import { createRequire } from 'node:module'
import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { dirname, join } from 'node:path'

/**
 * BFS over the real dependency graph (dependencies + optionalDependencies), pure w.r.t. the
 * filesystem — `resolver(name, fromDir)` does the resolving. Returns the flat closure to stage,
 * missing optionals (skipped, not fatal), and name collisions a flat node_modules can't hold.
 */
export function collectRuntimeClosure(roots, resolver) {
  const packages = new Map()
  const skippedOptionalSet = new Set()
  const conflicts = []
  const seenEdges = new Set()
  const queue = roots.map((name) => ({ name, fromDir: null, optional: false }))

  while (queue.length > 0) {
    const { name, fromDir, optional } = queue.shift()
    const edgeKey = `${name}\0${fromDir}`
    if (seenEdges.has(edgeKey)) {
      continue
    }
    seenEdges.add(edgeKey)

    let resolved
    try {
      resolved = resolver(name, fromDir)
    } catch (error) {
      if (optional) {
        skippedOptionalSet.add(name)
        continue
      }
      throw error
    }

    const existingDir = packages.get(name)
    if (existingDir === resolved.dir) {
      continue // already walked this exact package
    }
    if (existingDir !== undefined) {
      conflicts.push({ name, dirs: [existingDir, resolved.dir] })
      continue
    }
    packages.set(name, resolved.dir)

    const dependencies = resolved.packageJson.dependencies ?? {}
    const optionalDependencies = resolved.packageJson.optionalDependencies ?? {}
    for (const depName of Object.keys(dependencies)) {
      queue.push({ name: depName, fromDir: resolved.dir, optional: false })
    }
    for (const depName of Object.keys(optionalDependencies)) {
      queue.push({ name: depName, fromDir: resolved.dir, optional: true })
    }
  }

  return { packages, skippedOptional: [...skippedOptionalSet], conflicts }
}

function readPackageJson(dir) {
  return JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
}

/** Walks up from a resolved entry file to the package.json whose "name" matches — for packages whose `exports` block resolving `<name>/package.json` directly. */
function packageDirFromEntry(entryFile, name) {
  let dir = dirname(entryFile)
  for (;;) {
    const pkgJsonPath = join(dir, 'package.json')
    if (existsSync(pkgJsonPath) && JSON.parse(readFileSync(pkgJsonPath, 'utf8')).name === name) {
      return dir
    }
    const parent = dirname(dir)
    if (parent === dir) {
      throw new Error(`no package.json named "${name}" above ${entryFile}`)
    }
    dir = parent
  }
}

/** Real resolver: Node module resolution from `fromDir` (or `rootDir` for roots), realpath'd past pnpm's symlinks. */
export function createRealResolver(rootDir) {
  return function resolveRuntimePackage(name, fromDir) {
    const require = createRequire(join(fromDir ?? rootDir, 'package.json'))
    let dir
    try {
      dir = dirname(require.resolve(`${name}/package.json`))
    } catch {
      dir = packageDirFromEntry(require.resolve(name), name)
    }
    dir = realpathSync(dir)
    return { dir, packageJson: readPackageJson(dir) }
  }
}
