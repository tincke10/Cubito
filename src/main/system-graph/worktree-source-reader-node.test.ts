import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createNodeWorktreeSourceReader } from './worktree-source-reader-node'

const tempDirs: string[] = []

async function makeTempWorktreeDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'orca-worktree-source-reader-'))
  tempDirs.push(dir)
  return dir
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe('createNodeWorktreeSourceReader', () => {
  it('reads a small text file relative to the worktree root', async () => {
    const root = await makeTempWorktreeDir()
    await writeFile(join(root, 'index.ts'), 'export const x = 1')
    const reader = createNodeWorktreeSourceReader(root)

    await expect(reader.readFileText('index.ts')).resolves.toBe('export const x = 1')
  })

  it('returns null for a missing file', async () => {
    const root = await makeTempWorktreeDir()
    const reader = createNodeWorktreeSourceReader(root)

    await expect(reader.readFileText('missing.ts')).resolves.toBeNull()
  })

  it('returns null for a file over the 128KB cap', async () => {
    const root = await makeTempWorktreeDir()
    await writeFile(join(root, 'big.ts'), 'x'.repeat(128 * 1024 + 1))
    const reader = createNodeWorktreeSourceReader(root)

    await expect(reader.readFileText('big.ts')).resolves.toBeNull()
  })

  it('returns null for a binary file', async () => {
    const root = await makeTempWorktreeDir()
    await writeFile(join(root, 'image.png'), Buffer.from([0, 1, 2, 0, 3, 0, 4]))
    const reader = createNodeWorktreeSourceReader(root)

    await expect(reader.readFileText('image.png')).resolves.toBeNull()
  })

  it('lists a directory with isDirectory flags', async () => {
    const root = await makeTempWorktreeDir()
    await mkdir(join(root, 'src'))
    await writeFile(join(root, 'src', 'a.ts'), '')
    await mkdir(join(root, 'src', 'nested'))

    const reader = createNodeWorktreeSourceReader(root)
    const entries = await reader.listDir('src')

    expect(entries).toEqual(
      expect.arrayContaining([
        { name: 'a.ts', isDirectory: false },
        { name: 'nested', isDirectory: true }
      ])
    )
  })

  it('returns an empty list for a missing directory', async () => {
    const root = await makeTempWorktreeDir()
    const reader = createNodeWorktreeSourceReader(root)

    await expect(reader.listDir('missing')).resolves.toEqual([])
  })

  it('reads package.json at the worktree root', async () => {
    const root = await makeTempWorktreeDir()
    await writeFile(join(root, 'package.json'), JSON.stringify({ name: 'demo' }))
    const reader = createNodeWorktreeSourceReader(root)

    await expect(reader.readPackageJson()).resolves.toEqual({ name: 'demo' })
  })

  it('returns null when package.json is missing', async () => {
    const root = await makeTempWorktreeDir()
    const reader = createNodeWorktreeSourceReader(root)

    await expect(reader.readPackageJson()).resolves.toBeNull()
  })

  it('returns null when package.json is not valid JSON', async () => {
    const root = await makeTempWorktreeDir()
    await writeFile(join(root, 'package.json'), '{not json')
    const reader = createNodeWorktreeSourceReader(root)

    await expect(reader.readPackageJson()).resolves.toBeNull()
  })
})
