import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  markAgentWorkspaceTrusted: vi.fn(async () => undefined)
}))

vi.mock('../agent-workspace-trust', () => mocks)

const { OrcaRuntimeService } = await import('./orca-runtime')

function createRuntime(
  agentDefaultEnv: Record<string, Record<string, string>> = {},
  deps: { getManagedClaudeConfigDirOverride?: () => string | null } = {}
) {
  const runtime = new OrcaRuntimeService(
    {
      getSettings: () => ({
        disabledTuiAgents: [],
        agentCmdOverrides: {},
        agentDefaultArgs: {},
        agentDefaultEnv
      })
    } as never,
    undefined,
    deps
  )
  return runtime as unknown as {
    markLocalWorkspaceTrustedForAgent: (agent: string, workspacePath: string) => Promise<void>
    markRemoteWorkspaceTrustedForAgent: (
      agent: string,
      connectionId: string,
      workspacePath: string
    ) => Promise<void>
  }
}

describe('markLocalWorkspaceTrustedForAgent — dispatch to the shared trust module', () => {
  it('routes claude through markAgentWorkspaceTrusted on a local host', async () => {
    const internal = createRuntime()

    await internal.markLocalWorkspaceTrustedForAgent('claude', '/tmp/worktree-1')

    expect(mocks.markAgentWorkspaceTrusted).toHaveBeenCalledWith({
      preset: 'claude',
      workspacePath: '/tmp/worktree-1',
      host: { kind: 'local' }
    })
  })

  it('forwards a per-agent CLAUDE_CONFIG_DIR override', async () => {
    const internal = createRuntime({ claude: { CLAUDE_CONFIG_DIR: '/acct-2' } })

    await internal.markLocalWorkspaceTrustedForAgent('claude', '/tmp/worktree-1')

    expect(mocks.markAgentWorkspaceTrusted).toHaveBeenCalledWith({
      preset: 'claude',
      workspacePath: '/tmp/worktree-1',
      host: { kind: 'local' },
      claudeConfigDir: '/acct-2'
    })
  })

  it('forwards a per-agent CODEX_HOME override', async () => {
    const internal = createRuntime({ codex: { CODEX_HOME: '/managed-codex-home' } })

    await internal.markLocalWorkspaceTrustedForAgent('codex', '/tmp/worktree-1')

    expect(mocks.markAgentWorkspaceTrusted).toHaveBeenCalledWith({
      preset: 'codex',
      workspacePath: '/tmp/worktree-1',
      host: { kind: 'local' },
      codexHome: '/managed-codex-home'
    })
  })

  // Why: spawn-preflight spreads claudeAuth.envPatch last, so a managed account's
  // effective CLAUDE_CONFIG_DIR wins at launch over agentDefaultEnv.claude.CLAUDE_CONFIG_DIR.
  it('prefers the managed CLAUDE_CONFIG_DIR override over the agentDefaultEnv one', async () => {
    const internal = createRuntime(
      { claude: { CLAUDE_CONFIG_DIR: '/acct-2' } },
      { getManagedClaudeConfigDirOverride: () => '/managed/claude-config' }
    )

    await internal.markLocalWorkspaceTrustedForAgent('claude', '/tmp/worktree-1')

    expect(mocks.markAgentWorkspaceTrusted).toHaveBeenCalledWith({
      preset: 'claude',
      workspacePath: '/tmp/worktree-1',
      host: { kind: 'local' },
      claudeConfigDir: '/managed/claude-config'
    })
  })

  it('falls back to the agentDefaultEnv override when the managed dep returns null', async () => {
    const internal = createRuntime(
      { claude: { CLAUDE_CONFIG_DIR: '/acct-2' } },
      { getManagedClaudeConfigDirOverride: () => null }
    )

    await internal.markLocalWorkspaceTrustedForAgent('claude', '/tmp/worktree-1')

    expect(mocks.markAgentWorkspaceTrusted).toHaveBeenCalledWith({
      preset: 'claude',
      workspacePath: '/tmp/worktree-1',
      host: { kind: 'local' },
      claudeConfigDir: '/acct-2'
    })
  })

  it('falls back to the agentDefaultEnv override when the managed dep is not provided', async () => {
    const internal = createRuntime({ claude: { CLAUDE_CONFIG_DIR: '/acct-2' } })

    await internal.markLocalWorkspaceTrustedForAgent('claude', '/tmp/worktree-1')

    expect(mocks.markAgentWorkspaceTrusted).toHaveBeenCalledWith({
      preset: 'claude',
      workspacePath: '/tmp/worktree-1',
      host: { kind: 'local' },
      claudeConfigDir: '/acct-2'
    })
  })
})

describe('markRemoteWorkspaceTrustedForAgent — dispatch to the shared trust module', () => {
  it('routes claude through markAgentWorkspaceTrusted on a remote host', async () => {
    const internal = createRuntime()

    await internal.markRemoteWorkspaceTrustedForAgent('claude', 'ssh-1', '/tmp/worktree-1')

    expect(mocks.markAgentWorkspaceTrusted).toHaveBeenCalledWith({
      preset: 'claude',
      workspacePath: '/tmp/worktree-1',
      host: { kind: 'remote', connectionId: 'ssh-1' }
    })
  })

  it('forwards a per-agent CLAUDE_CONFIG_DIR override on a remote host', async () => {
    const internal = createRuntime({ claude: { CLAUDE_CONFIG_DIR: '/acct-2' } })

    await internal.markRemoteWorkspaceTrustedForAgent('claude', 'ssh-1', '/tmp/worktree-1')

    expect(mocks.markAgentWorkspaceTrusted).toHaveBeenCalledWith({
      preset: 'claude',
      workspacePath: '/tmp/worktree-1',
      host: { kind: 'remote', connectionId: 'ssh-1' },
      claudeConfigDir: '/acct-2'
    })
  })

  it('forwards a per-agent CODEX_HOME override on a remote host', async () => {
    const internal = createRuntime({ codex: { CODEX_HOME: '/managed-codex-home' } })

    await internal.markRemoteWorkspaceTrustedForAgent('codex', 'ssh-1', '/tmp/worktree-1')

    expect(mocks.markAgentWorkspaceTrusted).toHaveBeenCalledWith({
      preset: 'codex',
      workspacePath: '/tmp/worktree-1',
      host: { kind: 'remote', connectionId: 'ssh-1' },
      codexHome: '/managed-codex-home'
    })
  })
})
