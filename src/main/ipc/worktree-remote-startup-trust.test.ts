import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { GlobalSettings } from '../../shared/global-settings-types'
import type { OrcaRuntimeService } from '../runtime/orca-runtime'

const mocks = vi.hoisted(() => ({
  markAgentWorkspaceTrusted: vi.fn(async () => undefined)
}))

vi.mock('../agent-workspace-trust', () => mocks)

const { spawnLocalStartupAndSetupTerminals } = await import('./worktree-remote')

function makeRuntime(overrides: Record<string, unknown> = {}) {
  return {
    createTerminal: vi.fn(async () => ({ handle: 'term-1', surface: 'pane' })),
    splitTerminal: vi.fn(async () => undefined),
    ...overrides
  } as unknown as OrcaRuntimeService
}

function makeSettings(agentDefaultEnv: Record<string, Record<string, string>> = {}) {
  return {
    disabledTuiAgents: [],
    agentCmdOverrides: {},
    agentDefaultArgs: {},
    agentDefaultEnv
  } as unknown as GlobalSettings
}

const worktree = { id: 'wt-1', path: '/repo/worktree' }

beforeEach(() => {
  vi.clearAllMocks()
})

describe('spawnLocalStartupAndSetupTerminals — startup trust dispatch', () => {
  it('routes claude through the shared dispatcher with a local host', async () => {
    const runtime = makeRuntime()

    await spawnLocalStartupAndSetupTerminals({
      runtime,
      worktree,
      startup: { command: 'claude' },
      setup: undefined,
      defaultTabs: undefined,
      settings: makeSettings(),
      createdWithAgent: 'claude'
    })

    expect(mocks.markAgentWorkspaceTrusted).toHaveBeenCalledWith({
      preset: 'claude',
      workspacePath: '/repo/worktree',
      host: { kind: 'local' }
    })
  })

  it('forwards a per-agent CLAUDE_CONFIG_DIR override from settings', async () => {
    const runtime = makeRuntime()

    await spawnLocalStartupAndSetupTerminals({
      runtime,
      worktree,
      startup: { command: 'claude' },
      setup: undefined,
      defaultTabs: undefined,
      settings: makeSettings({ claude: { CLAUDE_CONFIG_DIR: '/acct-2' } }),
      createdWithAgent: 'claude'
    })

    expect(mocks.markAgentWorkspaceTrusted).toHaveBeenCalledWith({
      preset: 'claude',
      workspacePath: '/repo/worktree',
      host: { kind: 'local' },
      claudeConfigDir: '/acct-2'
    })
  })

  it('forwards a per-agent CODEX_HOME override from settings', async () => {
    const runtime = makeRuntime()

    await spawnLocalStartupAndSetupTerminals({
      runtime,
      worktree,
      startup: { command: 'codex' },
      setup: undefined,
      defaultTabs: undefined,
      settings: makeSettings({ codex: { CODEX_HOME: '/managed-codex-home' } }),
      createdWithAgent: 'codex'
    })

    expect(mocks.markAgentWorkspaceTrusted).toHaveBeenCalledWith({
      preset: 'codex',
      workspacePath: '/repo/worktree',
      host: { kind: 'local' },
      codexHome: '/managed-codex-home'
    })
  })

  it.each(['cursor', 'copilot', 'codex'] as const)(
    'routes %s through the shared dispatcher with a local host',
    async (agent) => {
      const runtime = makeRuntime()

      await spawnLocalStartupAndSetupTerminals({
        runtime,
        worktree,
        startup: { command: agent },
        setup: undefined,
        defaultTabs: undefined,
        settings: makeSettings(),
        createdWithAgent: agent
      })

      expect(mocks.markAgentWorkspaceTrusted).toHaveBeenCalledWith({
        preset: agent,
        workspacePath: '/repo/worktree',
        host: { kind: 'local' }
      })
    }
  )
})
