import { describe, expect, it } from 'vitest'
import { detectFramework } from './framework-detector'
import type { WorktreeSourceReader } from './worktree-source-reader'

// Fake reader proves the detector works identically for local and SSH worktrees
// since it never touches disk directly — only the port.
function fakeReader(overrides: Partial<WorktreeSourceReader>): WorktreeSourceReader {
  return {
    readFileText: async () => null,
    listDir: async () => [],
    readPackageJson: async () => null,
    ...overrides
  }
}

describe('detectFramework', () => {
  it('detects express when a tsconfig.json is present', async () => {
    const reader = fakeReader({
      readPackageJson: async () => ({ dependencies: { express: '^4.19.0' } }),
      readFileText: async (rel) => (rel === 'tsconfig.json' ? '{}' : null)
    })
    await expect(detectFramework(reader)).resolves.toBe('express')
  })

  it('detects express via @types/express in devDependencies plus a typescript dep', async () => {
    const reader = fakeReader({
      readPackageJson: async () => ({
        devDependencies: { '@types/express': '^4.17.0', typescript: '^5.5.0' }
      })
    })
    await expect(detectFramework(reader)).resolves.toBe('express')
  })

  it('detects express via .ts files present at the worktree root', async () => {
    const reader = fakeReader({
      readPackageJson: async () => ({ dependencies: { express: '^4.19.0' } }),
      listDir: async (rel) => (rel === '.' ? [{ name: 'server.ts', isDirectory: false }] : [])
    })
    await expect(detectFramework(reader)).resolves.toBe('express')
  })

  it('returns null when express is present but no TS signal exists', async () => {
    const reader = fakeReader({
      readPackageJson: async () => ({ dependencies: { express: '^4.19.0' } })
    })
    await expect(detectFramework(reader)).resolves.toBeNull()
  })

  it('returns null when express is absent entirely', async () => {
    const reader = fakeReader({
      readPackageJson: async () => ({ dependencies: { fastify: '^4.0.0' } }),
      readFileText: async (rel) => (rel === 'tsconfig.json' ? '{}' : null)
    })
    await expect(detectFramework(reader)).resolves.toBeNull()
  })

  it('returns null when package.json is missing', async () => {
    const reader = fakeReader({})
    await expect(detectFramework(reader)).resolves.toBeNull()
  })
})
