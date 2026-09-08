import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const testState = {
  fakeHomeDir: '',
  userDataDir: '',
  previousUserDataPath: undefined as string | undefined
}

vi.mock('electron', () => ({
  app: {
    getPath: (name: string) => {
      if (name === 'userData') {
        return testState.userDataDir
      }
      throw new Error(`unexpected app.getPath(${name})`)
    }
  }
}))

vi.mock('node:os', async () => {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports -- vi.importActual requires inline import()
  const actual = await vi.importActual<typeof import('node:os')>('node:os')
  return {
    ...actual,
    homedir: () => testState.fakeHomeDir
  }
})

const writeFileAtomicallySpy = vi.hoisted(() => vi.fn())
vi.mock('./codex-accounts/fs-utils', async () => {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports -- vi.importActual requires inline import()
  const actual = await vi.importActual<typeof import('./codex-accounts/fs-utils')>(
    './codex-accounts/fs-utils'
  )
  return {
    ...actual,
    writeFileAtomically: (...args: Parameters<typeof actual.writeFileAtomically>) => {
      writeFileAtomicallySpy(...args)
      return actual.writeFileAtomically(...args)
    }
  }
})

const {
  markClaudeWorkspaceTrusted,
  markCodexProjectTrusted,
  markCopilotFolderTrusted,
  markCursorWorkspaceTrusted
} = await import('./agent-trust-presets')
const { runExclusivelyForCodexTrustConfig } =
  await import('./codex/codex-trust-config-mutation-queue')

beforeEach(() => {
  testState.fakeHomeDir = mkdtempSync(join(tmpdir(), 'orca-trust-presets-'))
  testState.userDataDir = mkdtempSync(join(tmpdir(), 'orca-trust-presets-user-data-'))
  testState.previousUserDataPath = process.env.ORCA_USER_DATA_PATH
  process.env.ORCA_USER_DATA_PATH = testState.userDataDir
  writeFileAtomicallySpy.mockClear()
})

afterEach(() => {
  rmSync(testState.fakeHomeDir, { recursive: true, force: true })
  rmSync(testState.userDataDir, { recursive: true, force: true })
  if (testState.previousUserDataPath === undefined) {
    delete process.env.ORCA_USER_DATA_PATH
  } else {
    process.env.ORCA_USER_DATA_PATH = testState.previousUserDataPath
  }
  testState.fakeHomeDir = ''
  testState.userDataDir = ''
  testState.previousUserDataPath = undefined
})

describe('markCursorWorkspaceTrusted', () => {
  it('writes ~/.cursor/projects/<slug>/.workspace-trusted with the cwd payload', () => {
    const workspace = mkdtempSync(join(tmpdir(), 'orca-cursor-ws-'))
    try {
      markCursorWorkspaceTrusted(workspace)
      const projectsDir = join(testState.fakeHomeDir, '.cursor', 'projects')
      const slugDirs = readdirSync(projectsDir)
      expect(slugDirs.length).toBe(1)
      const trustFile = join(projectsDir, slugDirs[0], '.workspace-trusted')
      expect(existsSync(trustFile)).toBe(true)
      const payload = JSON.parse(readFileSync(trustFile, 'utf-8'))
      expect(payload.workspacePath).toBeTruthy()
      expect(typeof payload.trustedAt).toBe('string')
    } finally {
      rmSync(workspace, { recursive: true, force: true })
    }
  })

  it('is idempotent — re-marking the same workspace does not overwrite trustedAt', () => {
    const workspace = mkdtempSync(join(tmpdir(), 'orca-cursor-ws-'))
    try {
      markCursorWorkspaceTrusted(workspace)
      const projectsDir = join(testState.fakeHomeDir, '.cursor', 'projects')
      const slugDirs = readdirSync(projectsDir)
      const trustFile = join(projectsDir, slugDirs[0], '.workspace-trusted')
      const firstPayload = readFileSync(trustFile, 'utf-8')
      markCursorWorkspaceTrusted(workspace)
      const secondPayload = readFileSync(trustFile, 'utf-8')
      expect(secondPayload).toBe(firstPayload)
    } finally {
      rmSync(workspace, { recursive: true, force: true })
    }
  })
})

describe('markCopilotFolderTrusted', () => {
  it('appends the workspace to trustedFolders in ~/.copilot/config.json', () => {
    const workspace = mkdtempSync(join(tmpdir(), 'orca-copilot-ws-'))
    try {
      markCopilotFolderTrusted(workspace)
      const configPath = join(testState.fakeHomeDir, '.copilot', 'config.json')
      expect(existsSync(configPath)).toBe(true)
      const parsed = JSON.parse(readFileSync(configPath, 'utf-8'))
      expect(Array.isArray(parsed.trustedFolders)).toBe(true)
      expect(parsed.trustedFolders.length).toBe(1)
      expect(typeof parsed.trustedFolders[0]).toBe('string')
    } finally {
      rmSync(workspace, { recursive: true, force: true })
    }
  })

  it('preserves existing config keys and dedups already-trusted folders', () => {
    const workspace = mkdtempSync(join(tmpdir(), 'orca-copilot-ws-'))
    const realpath = realpathSync(workspace)
    try {
      mkdirSync(join(testState.fakeHomeDir, '.copilot'), { recursive: true })
      writeFileSync(
        join(testState.fakeHomeDir, '.copilot', 'config.json'),
        JSON.stringify({
          firstLaunchAt: '2026-01-01T00:00:00.000Z',
          trustedFolders: [realpath]
        })
      )
      markCopilotFolderTrusted(workspace)
      const parsed = JSON.parse(
        readFileSync(join(testState.fakeHomeDir, '.copilot', 'config.json'), 'utf-8')
      )
      expect(parsed.firstLaunchAt).toBe('2026-01-01T00:00:00.000Z')
      expect(parsed.trustedFolders).toHaveLength(1)
    } finally {
      rmSync(workspace, { recursive: true, force: true })
    }
  })
})

describe('markClaudeWorkspaceTrusted', () => {
  it('writes projects[realpath].hasTrustDialogAccepted = true to the config path', () => {
    const workspace = mkdtempSync(join(tmpdir(), 'orca-claude-ws-'))
    const configPath = join(testState.fakeHomeDir, '.claude.json')
    try {
      const realpath = realpathSync.native(workspace)
      markClaudeWorkspaceTrusted(workspace, configPath)
      expect(existsSync(configPath)).toBe(true)
      const parsed = JSON.parse(readFileSync(configPath, 'utf-8'))
      expect(parsed.projects[realpath].hasTrustDialogAccepted).toBe(true)
    } finally {
      rmSync(workspace, { recursive: true, force: true })
    }
  })

  it('preserves sibling project entries and other fields on the same project', () => {
    const workspace = mkdtempSync(join(tmpdir(), 'orca-claude-ws-'))
    const configPath = join(testState.fakeHomeDir, '.claude.json')
    try {
      const realpath = realpathSync.native(workspace)
      writeFileSync(
        configPath,
        JSON.stringify({
          oauthAccount: { email: 'dev@example.com' },
          projects: {
            '/other/project': { hasTrustDialogAccepted: true },
            [realpath]: { mcpServers: { keep: 'me' } }
          }
        })
      )
      markClaudeWorkspaceTrusted(workspace, configPath)
      const parsed = JSON.parse(readFileSync(configPath, 'utf-8'))
      expect(parsed.oauthAccount).toEqual({ email: 'dev@example.com' })
      expect(parsed.projects['/other/project']).toEqual({ hasTrustDialogAccepted: true })
      expect(parsed.projects[realpath]).toEqual({
        mcpServers: { keep: 'me' },
        hasTrustDialogAccepted: true
      })
    } finally {
      rmSync(workspace, { recursive: true, force: true })
    }
  })

  it('is idempotent — does not rewrite the file when already trusted', () => {
    const workspace = mkdtempSync(join(tmpdir(), 'orca-claude-ws-'))
    const configPath = join(testState.fakeHomeDir, '.claude.json')
    try {
      markClaudeWorkspaceTrusted(workspace, configPath)
      expect(writeFileAtomicallySpy).toHaveBeenCalledTimes(1)
      markClaudeWorkspaceTrusted(workspace, configPath)
      expect(writeFileAtomicallySpy).toHaveBeenCalledTimes(1)
    } finally {
      rmSync(workspace, { recursive: true, force: true })
    }
  })

  it('respects configPathOverride instead of the default ClaudeRuntimePathResolver path', () => {
    const workspace = mkdtempSync(join(tmpdir(), 'orca-claude-ws-'))
    const overridePath = join(testState.fakeHomeDir, 'custom', '.claude.json')
    const defaultPath = join(testState.fakeHomeDir, '.claude.json')
    try {
      mkdirSync(join(testState.fakeHomeDir, 'custom'), { recursive: true })
      markClaudeWorkspaceTrusted(workspace, overridePath)
      expect(existsSync(overridePath)).toBe(true)
      expect(existsSync(defaultPath)).toBe(false)
    } finally {
      rmSync(workspace, { recursive: true, force: true })
    }
  })

  it('canonicalizes a symlinked workspace path to its realpath before writing', () => {
    const realDir = mkdtempSync(join(tmpdir(), 'orca-claude-real-'))
    const symlinkParent = mkdtempSync(join(tmpdir(), 'orca-claude-link-'))
    const symlinkPath = join(symlinkParent, 'linked-workspace')
    const configPath = join(testState.fakeHomeDir, '.claude.json')
    try {
      symlinkSync(realDir, symlinkPath, 'dir')
      const realpath = realpathSync.native(realDir)
      markClaudeWorkspaceTrusted(symlinkPath, configPath)
      const parsed = JSON.parse(readFileSync(configPath, 'utf-8'))
      expect(parsed.projects[realpath].hasTrustDialogAccepted).toBe(true)
      expect(parsed.projects[symlinkPath]).toBeUndefined()
    } finally {
      rmSync(realDir, { recursive: true, force: true })
      rmSync(symlinkParent, { recursive: true, force: true })
    }
  })
})

describe('markCodexProjectTrusted', () => {
  // Why (#16441): a hook install/grant holds this file across an awaited
  // app-server session; an unqueued write here lands inside its
  // capture->restore window and is silently reverted.
  it('queues behind an in-flight Codex trust-config mutation', async () => {
    const workspace = mkdtempSync(join(tmpdir(), 'orca-codex-ws-'))
    const configPath = join(testState.fakeHomeDir, '.codex', 'config.toml')
    let releaseGrant!: () => void
    const grantHoldingTheFile = new Promise<void>((resolve) => {
      releaseGrant = resolve
    })
    try {
      const held = runExclusivelyForCodexTrustConfig(configPath, () => grantHoldingTheFile)
      const marked = markCodexProjectTrusted(workspace)
      await Promise.resolve()
      expect(existsSync(configPath)).toBe(false)

      releaseGrant()
      await held
      await marked
      expect(readFileSync(configPath, 'utf-8')).toContain('trust_level = "trusted"')
    } finally {
      rmSync(workspace, { recursive: true, force: true })
    }
  })

  it('trusts the main repository root for a linked worktree without reading commondir', async () => {
    const fixtureRoot = mkdtempSync(join(tmpdir(), 'orca-codex-linked-ws-'))
    const repository = join(fixtureRoot, 'repo')
    const workspace = join(fixtureRoot, 'worktrees', 'feature')
    const worktreeGitDir = join(repository, '.git', 'worktrees', 'feature')
    try {
      mkdirSync(worktreeGitDir, { recursive: true })
      mkdirSync(workspace, { recursive: true })
      writeFileSync(join(workspace, '.git'), `gitdir: ${worktreeGitDir}\n`, 'utf-8')
      writeFileSync(join(worktreeGitDir, 'gitdir'), join(workspace, '.git'), 'utf-8')

      await markCodexProjectTrusted(workspace)

      const repositoryRoot = realpathSync.native(repository)
      const workspaceRoot = realpathSync.native(workspace)
      const configPath = join(testState.fakeHomeDir, '.codex', 'config.toml')
      const runtimeConfigPath = join(
        testState.userDataDir,
        'codex-runtime-home',
        'home',
        'config.toml'
      )
      for (const written of [
        readFileSync(configPath, 'utf-8'),
        readFileSync(runtimeConfigPath, 'utf-8')
      ]) {
        expect(written).toContain(`[projects."${escapeTomlBasicString(repositoryRoot)}"]`)
        expect(written).not.toContain(`[projects."${escapeTomlBasicString(workspaceRoot)}"]`)
      }
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true })
    }
  })

  it('does not broaden trust through arbitrary or adversarial Git metadata', async () => {
    const fixtureRoot = mkdtempSync(join(tmpdir(), 'orca-codex-untrusted-gitdir-'))
    const workspace = join(fixtureRoot, 'workspace')
    const arbitraryGitDir = join(fixtureRoot, 'metadata', 'feature')
    const unrelatedRoot = join(fixtureRoot, 'unrelated')
    try {
      mkdirSync(arbitraryGitDir, { recursive: true })
      mkdirSync(workspace, { recursive: true })
      mkdirSync(unrelatedRoot, { recursive: true })
      writeFileSync(join(workspace, '.git'), `gitdir: ${arbitraryGitDir}\n`, 'utf-8')
      writeFileSync(join(arbitraryGitDir, 'commondir'), join(unrelatedRoot, '.git'), 'utf-8')

      await markCodexProjectTrusted(workspace)
      const structuredGitDir = join(unrelatedRoot, '.git', 'worktrees', 'feature')
      mkdirSync(structuredGitDir, { recursive: true })
      writeFileSync(join(workspace, '.git'), `gitdir: ${structuredGitDir}\n`, 'utf-8')
      writeFileSync(join(structuredGitDir, 'gitdir'), join(unrelatedRoot, '.git'), 'utf-8')
      await markCodexProjectTrusted(workspace)

      const written = readFileSync(join(testState.fakeHomeDir, '.codex', 'config.toml'), 'utf-8')
      expect(written).toContain(
        `[projects."${escapeTomlBasicString(realpathSync.native(workspace))}"]`
      )
      expect(written).not.toContain(
        `[projects."${escapeTomlBasicString(realpathSync.native(unrelatedRoot))}"]`
      )
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true })
    }
  })

  it('writes ~/.codex/config.toml with the project marked trusted', async () => {
    const workspace = mkdtempSync(join(tmpdir(), 'orca-codex-ws-'))
    try {
      const realpath = realpathSync.native(workspace)
      await markCodexProjectTrusted(workspace)
      const configPath = join(testState.fakeHomeDir, '.codex', 'config.toml')
      const runtimeConfigPath = join(
        testState.userDataDir,
        'codex-runtime-home',
        'home',
        'config.toml'
      )
      expect(existsSync(configPath)).toBe(true)
      expect(existsSync(runtimeConfigPath)).toBe(true)
      const written = readFileSync(configPath, 'utf-8')
      const runtimeWritten = readFileSync(runtimeConfigPath, 'utf-8')
      expect(written).toContain(`[projects."${escapeTomlBasicString(realpath)}"]`)
      expect(written).toContain('trust_level = "trusted"')
      expect(runtimeWritten).toContain(`[projects."${escapeTomlBasicString(realpath)}"]`)
      expect(runtimeWritten).toContain('trust_level = "trusted"')
    } finally {
      rmSync(workspace, { recursive: true, force: true })
    }
  })

  it('preserves existing config keys and updates an existing project block', async () => {
    const workspace = mkdtempSync(join(tmpdir(), 'orca-codex-ws-'))
    const realpath = realpathSync.native(workspace)
    try {
      const codexDir = join(testState.fakeHomeDir, '.codex')
      const runtimeCodexDir = join(testState.userDataDir, 'codex-runtime-home', 'home')
      mkdirSync(codexDir, { recursive: true })
      mkdirSync(runtimeCodexDir, { recursive: true })
      writeFileSync(
        join(codexDir, 'config.toml'),
        [
          'model = "gpt-5.5"',
          '',
          `[projects."${escapeTomlBasicString(realpath)}"]`,
          'notes = "keep"',
          'trust_level = "untrusted"',
          ''
        ].join('\n'),
        'utf-8'
      )
      writeFileSync(
        join(runtimeCodexDir, 'config.toml'),
        [
          'sandbox_mode = "workspace-write"',
          '',
          `[projects."${escapeTomlBasicString(realpath)}"]`,
          'notes = "keep-runtime"',
          'trust_level = "untrusted"',
          ''
        ].join('\n'),
        'utf-8'
      )

      await markCodexProjectTrusted(workspace)

      const written = readFileSync(join(codexDir, 'config.toml'), 'utf-8')
      const runtimeWritten = readFileSync(join(runtimeCodexDir, 'config.toml'), 'utf-8')
      expect(written).toContain('model = "gpt-5.5"')
      expect(written).toContain('notes = "keep"')
      expect(written).toContain('trust_level = "trusted"')
      expect(written).not.toContain('trust_level = "untrusted"')
      expect(runtimeWritten).toContain('sandbox_mode = "workspace-write"')
      expect(runtimeWritten).toContain('notes = "keep-runtime"')
      expect(runtimeWritten).toContain('trust_level = "trusted"')
      expect(runtimeWritten).not.toContain('trust_level = "untrusted"')
    } finally {
      rmSync(workspace, { recursive: true, force: true })
    }
  })
})

function escapeTomlBasicString(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')
}
