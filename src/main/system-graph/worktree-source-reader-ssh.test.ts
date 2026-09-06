import { describe, expect, it } from 'vitest'
import type { FileStat, IFilesystemProvider } from '../providers/types'
import { createSshWorktreeSourceReader } from './worktree-source-reader-ssh'

function fakeProvider(overrides: Partial<IFilesystemProvider>): IFilesystemProvider {
  return {
    readDir: async () => [],
    readFile: async () => ({ content: '', isBinary: false }),
    writeFile: async () => {},
    writeFileBase64: async () => {},
    writeFileBase64Chunk: async () => {},
    stat: async () => ({ size: 0, type: 'file', mtime: 0 }),
    deletePath: async () => {},
    createFile: async () => {},
    createDir: async () => {},
    createDirNoClobber: async () => {},
    rename: async () => {},
    renameNoClobber: async () => {},
    copy: async () => {},
    realpath: async (p) => p,
    search: async () => ({ results: [], truncated: false }) as never,
    listFiles: async () => [],
    watch: async () => () => {},
    ...overrides
  } as IFilesystemProvider
}

const ROOT = '/remote/worktree'

describe('createSshWorktreeSourceReader', () => {
  it('reads a small text file relative to the worktree root', async () => {
    const provider = fakeProvider({
      stat: async (path): Promise<FileStat> =>
        path === `${ROOT}/index.ts`
          ? { size: 12, type: 'file', mtime: 0 }
          : { size: 0, type: 'file', mtime: 0 },
      readFile: async () => ({ content: 'export const x = 1', isBinary: false })
    })
    const reader = createSshWorktreeSourceReader(provider, ROOT)

    await expect(reader.readFileText('index.ts')).resolves.toBe('export const x = 1')
  })

  it('returns null when stat throws (missing file)', async () => {
    const provider = fakeProvider({
      stat: async () => {
        throw new Error('ENOENT')
      }
    })
    const reader = createSshWorktreeSourceReader(provider, ROOT)

    await expect(reader.readFileText('missing.ts')).resolves.toBeNull()
  })

  it('returns null for a file over the 128KB cap', async () => {
    const provider = fakeProvider({
      stat: async () => ({ size: 128 * 1024 + 1, type: 'file', mtime: 0 })
    })
    const reader = createSshWorktreeSourceReader(provider, ROOT)

    await expect(reader.readFileText('big.ts')).resolves.toBeNull()
  })

  it('returns null when the provider reports the file as binary', async () => {
    const provider = fakeProvider({
      stat: async () => ({ size: 10, type: 'file', mtime: 0 }),
      readFile: async () => ({ content: '', isBinary: true })
    })
    const reader = createSshWorktreeSourceReader(provider, ROOT)

    await expect(reader.readFileText('image.png')).resolves.toBeNull()
  })

  it('lists a directory using the provider readDir call', async () => {
    const provider = fakeProvider({
      readDir: async (path) =>
        path === `${ROOT}/src`
          ? [
              { name: 'a.ts', isDirectory: false, isSymlink: false },
              { name: 'nested', isDirectory: true, isSymlink: false }
            ]
          : []
    })
    const reader = createSshWorktreeSourceReader(provider, ROOT)

    await expect(reader.listDir('src')).resolves.toEqual([
      { name: 'a.ts', isDirectory: false },
      { name: 'nested', isDirectory: true }
    ])
  })

  it('returns an empty list when readDir throws', async () => {
    const provider = fakeProvider({
      readDir: async () => {
        throw new Error('ENOENT')
      }
    })
    const reader = createSshWorktreeSourceReader(provider, ROOT)

    await expect(reader.listDir('missing')).resolves.toEqual([])
  })

  it('reads and parses package.json at the worktree root', async () => {
    const provider = fakeProvider({
      stat: async () => ({ size: 20, type: 'file', mtime: 0 }),
      readFile: async () => ({ content: JSON.stringify({ name: 'demo' }), isBinary: false })
    })
    const reader = createSshWorktreeSourceReader(provider, ROOT)

    await expect(reader.readPackageJson()).resolves.toEqual({ name: 'demo' })
  })

  it('returns null when package.json is not valid JSON', async () => {
    const provider = fakeProvider({
      stat: async () => ({ size: 20, type: 'file', mtime: 0 }),
      readFile: async () => ({ content: '{not json', isBinary: false })
    })
    const reader = createSshWorktreeSourceReader(provider, ROOT)

    await expect(reader.readPackageJson()).resolves.toBeNull()
  })
})
