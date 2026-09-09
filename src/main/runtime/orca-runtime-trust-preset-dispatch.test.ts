import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  markAgentWorkspaceTrusted: vi.fn(async () => undefined)
}))

vi.mock('../agent-workspace-trust', () => mocks)

const { OrcaRuntimeService } = await import('./orca-runtime')

function createRuntime(agentDefaultEnv: Record<string, Record<string, string>> = {}) {
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
    undefined
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
