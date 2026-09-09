import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const testState = { fakeHomeDir: '', previousConfigDir: undefined as string | undefined }

vi.mock('node:os', async () => {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports -- vi.importActual requires inline import()
  const actual = await vi.importActual<typeof import('node:os')>('node:os')
  return { ...actual, homedir: () => testState.fakeHomeDir }
})

const { ClaudeRuntimePathResolver } = await import('./runtime-paths')

beforeEach(() => {
  testState.fakeHomeDir = mkdtempSync(join(tmpdir(), 'orca-runtime-paths-'))
  testState.previousConfigDir = process.env.CLAUDE_CONFIG_DIR
  delete process.env.CLAUDE_CONFIG_DIR
})

afterEach(() => {
  rmSync(testState.fakeHomeDir, { recursive: true, force: true })
  if (testState.previousConfigDir === undefined) {
    delete process.env.CLAUDE_CONFIG_DIR
  } else {
    process.env.CLAUDE_CONFIG_DIR = testState.previousConfigDir
  }
})

describe('ClaudeRuntimePathResolver.getRuntimePaths', () => {
  it('falls back to the home directory when neither override nor env is set', () => {
    const paths = new ClaudeRuntimePathResolver().getRuntimePaths()

    expect(paths.configDir).toBe(join(testState.fakeHomeDir, '.claude'))
    expect(paths.configPath).toBe(join(testState.fakeHomeDir, '.claude.json'))
    expect(paths.envPatch).toEqual({})
  })

  it('uses process.env.CLAUDE_CONFIG_DIR when no override is given', () => {
    const envConfigDir = join(testState.fakeHomeDir, 'env-account')
    process.env.CLAUDE_CONFIG_DIR = envConfigDir

    const paths = new ClaudeRuntimePathResolver().getRuntimePaths()

    expect(paths.configDir).toBe(envConfigDir)
    expect(paths.configPath).toBe(join(envConfigDir, '.claude.json'))
    expect(paths.envPatch).toEqual({ CLAUDE_CONFIG_DIR: envConfigDir })
  })

  it('an explicit override wins over process.env.CLAUDE_CONFIG_DIR', () => {
    process.env.CLAUDE_CONFIG_DIR = join(testState.fakeHomeDir, 'env-account')
    const overrideDir = join(testState.fakeHomeDir, 'override-account')

    const paths = new ClaudeRuntimePathResolver().getRuntimePaths(overrideDir)

    expect(paths.configDir).toBe(overrideDir)
    expect(paths.configPath).toBe(join(overrideDir, '.claude.json'))
    expect(paths.envPatch).toEqual({ CLAUDE_CONFIG_DIR: overrideDir })
  })

  it('an empty/whitespace override falls back to process.env.CLAUDE_CONFIG_DIR', () => {
    const envConfigDir = join(testState.fakeHomeDir, 'env-account')
    process.env.CLAUDE_CONFIG_DIR = envConfigDir

    const paths = new ClaudeRuntimePathResolver().getRuntimePaths('   ')

    expect(paths.configDir).toBe(envConfigDir)
  })

  it('an empty/whitespace override with no env falls back to the home directory', () => {
    const paths = new ClaudeRuntimePathResolver().getRuntimePaths('  ')

    expect(paths.configDir).toBe(join(testState.fakeHomeDir, '.claude'))
    expect(paths.configPath).toBe(join(testState.fakeHomeDir, '.claude.json'))
  })
})
