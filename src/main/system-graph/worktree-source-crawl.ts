import type { WorktreeSourceReader } from './worktree-source-reader'

export type CrawlSourceFilesOptions = { maxDepth?: number; maxFiles?: number }

// Why (D2): bounded so a huge or pathological worktree can't stall Wave 5 rebuilds.
const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'out',
  'coverage',
  '.next',
  '.turbo',
  '.cache',
  '.vercel',
  '.output',
  'tmp'
])
const SOURCE_EXTENSIONS = ['.ts', '.mts', '.cts', '.js', '.mjs', '.cjs']
const PREFERRED_SOURCE_DIRS = new Set(['src', 'app', 'routes', 'api', 'server', 'lib'])
const DEFAULT_MAX_DEPTH = 8
const DEFAULT_MAX_FILES = 2000

function isSourceFile(name: string): boolean {
  if (name.endsWith('.d.ts')) {
    return false
  }
  if (name.includes('.test.') || name.includes('.spec.')) {
    return false
  }
  return SOURCE_EXTENSIONS.some((ext) => name.endsWith(ext))
}

/** Pure bounded walk over the reader port: relative posix paths of candidate source files. */
export async function crawlSourceFiles(
  reader: WorktreeSourceReader,
  opts: CrawlSourceFilesOptions = {}
): Promise<string[]> {
  const maxDepth = opts.maxDepth ?? DEFAULT_MAX_DEPTH
  const maxFiles = opts.maxFiles ?? DEFAULT_MAX_FILES
  const results: string[] = []

  async function walk(relDir: string, depth: number): Promise<void> {
    if (depth > maxDepth || results.length >= maxFiles) {
      return
    }
    const entries = await reader.listDir(relDir)
    for (const entry of entries) {
      if (results.length >= maxFiles) {
        return
      }
      const childRel = relDir === '.' ? entry.name : `${relDir}/${entry.name}`
      if (entry.isDirectory) {
        if (!SKIP_DIRS.has(entry.name)) {
          await walk(childRel, depth + 1)
        }
      } else if (isSourceFile(entry.name)) {
        results.push(childRel)
      }
    }
  }

  const rootEntries = await reader.listDir('.')
  const preferredDirs = rootEntries.filter(
    (entry) => entry.isDirectory && PREFERRED_SOURCE_DIRS.has(entry.name)
  )

  if (preferredDirs.length > 0) {
    for (const dir of preferredDirs) {
      if (results.length >= maxFiles) {
        break
      }
      await walk(dir.name, 1)
    }
  } else {
    await walk('.', 1)
  }

  return results
}
