import { describe, expect, it } from 'vitest'
import { crawlSourceFiles } from './worktree-source-crawl'
import type { WorktreeSourceReader } from './worktree-source-reader'

type FakeEntry = { name: string; isDirectory: boolean }

/** In-memory tree: dir path ('.' for root) -> its entries. */
function fakeReader(tree: Record<string, FakeEntry[]>): WorktreeSourceReader {
  return {
    readFileText: async () => null,
    readPackageJson: async () => null,
    listDir: async (rel) => tree[rel] ?? []
  }
}

describe('crawlSourceFiles', () => {
  it('skips ignored directories (node_modules, .git, dist, build)', async () => {
    const reader = fakeReader({
      '.': [
        { name: 'src', isDirectory: true },
        { name: 'node_modules', isDirectory: true },
        { name: '.git', isDirectory: true },
        { name: 'dist', isDirectory: true },
        { name: 'build', isDirectory: true }
      ],
      src: [{ name: 'index.ts', isDirectory: false }],
      node_modules: [{ name: 'evil.ts', isDirectory: false }],
      '.git': [{ name: 'evil.ts', isDirectory: false }],
      dist: [{ name: 'evil.ts', isDirectory: false }],
      build: [{ name: 'evil.ts', isDirectory: false }]
    })

    await expect(crawlSourceFiles(reader)).resolves.toEqual(['src/index.ts'])
  })

  it('filters by source extension, excluding .d.ts, .test., and .spec. files', async () => {
    const reader = fakeReader({
      '.': [{ name: 'src', isDirectory: true }],
      src: [
        { name: 'app.ts', isDirectory: false },
        { name: 'app.mts', isDirectory: false },
        { name: 'app.cts', isDirectory: false },
        { name: 'app.js', isDirectory: false },
        { name: 'app.mjs', isDirectory: false },
        { name: 'app.cjs', isDirectory: false },
        { name: 'types.d.ts', isDirectory: false },
        { name: 'app.test.ts', isDirectory: false },
        { name: 'app.spec.ts', isDirectory: false },
        { name: 'README.md', isDirectory: false }
      ]
    })

    await expect(crawlSourceFiles(reader)).resolves.toEqual([
      'src/app.ts',
      'src/app.mts',
      'src/app.cts',
      'src/app.js',
      'src/app.mjs',
      'src/app.cjs'
    ])
  })

  it('caps traversal at max depth (8)', async () => {
    // Build a chain 9 levels deep under src; only the first 8 levels of dirs are descended.
    const tree: Record<string, FakeEntry[]> = { '.': [{ name: 'src', isDirectory: true }] }
    let path = 'src'
    for (let depth = 1; depth <= 9; depth++) {
      const dirName = `d${depth}`
      const fileName = `f${depth}.ts`
      tree[path] = [
        { name: dirName, isDirectory: true },
        { name: fileName, isDirectory: false }
      ]
      path = `${path}/${dirName}`
    }
    tree[path] = [{ name: 'toodeep.ts', isDirectory: false }]

    const files = await crawlSourceFiles(reader_from(tree))
    expect(files).toContain('src/f1.ts')
    expect(files.some((f) => f.endsWith('toodeep.ts'))).toBe(false)

    function reader_from(t: Record<string, FakeEntry[]>): WorktreeSourceReader {
      return fakeReader(t)
    }
  })

  it('caps total files at 2000', async () => {
    const entries: FakeEntry[] = []
    for (let i = 0; i < 2500; i++) {
      entries.push({ name: `file${i}.ts`, isDirectory: false })
    }
    const reader = fakeReader({ '.': [{ name: 'src', isDirectory: true }], src: entries })

    const files = await crawlSourceFiles(reader)
    expect(files.length).toBe(2000)
  })

  it('prefers source directories (src, app, routes, api, server, lib) over the rest of the root', async () => {
    const reader = fakeReader({
      '.': [
        { name: 'src', isDirectory: true },
        { name: 'scripts', isDirectory: true },
        { name: 'root.ts', isDirectory: false }
      ],
      src: [{ name: 'index.ts', isDirectory: false }],
      scripts: [{ name: 'ignored.ts', isDirectory: false }]
    })

    await expect(crawlSourceFiles(reader)).resolves.toEqual(['src/index.ts'])
  })

  it('falls back to the root when no preferred source directory exists', async () => {
    const reader = fakeReader({
      '.': [
        { name: 'lib_x', isDirectory: true },
        { name: 'root.ts', isDirectory: false }
      ],
      lib_x: [{ name: 'inner.ts', isDirectory: false }]
    })

    await expect(crawlSourceFiles(reader)).resolves.toEqual(
      expect.arrayContaining(['root.ts', 'lib_x/inner.ts'])
    )
  })
})
