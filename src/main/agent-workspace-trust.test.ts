import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  markCursorWorkspaceTrusted: vi.fn(),
  markCopilotFolderTrusted: vi.fn(),
  markCodexProjectTrusted: vi.fn(async () => undefined),
  markClaudeWorkspaceTrusted: vi.fn(),
  markRemoteAgentWorkspaceTrusted: vi.fn(async () => undefined),
  getRuntimePaths: vi.fn()
}))

vi.mock('./agent-trust-presets', () => ({
  markCursorWorkspaceTrusted: mocks.markCursorWorkspaceTrusted,
  markCopilotFolderTrusted: mocks.markCopilotFolderTrusted,
  markCodexProjectTrusted: mocks.markCodexProjectTrusted,
  markClaudeWorkspaceTrusted: mocks.markClaudeWorkspaceTrusted
}))

vi.mock('./remote-agent-trust-presets', () => ({
  markRemoteAgentWorkspaceTrusted: mocks.markRemoteAgentWorkspaceTrusted
}))

vi.mock('./claude-accounts/runtime-paths', () => ({
  ClaudeRuntimePathResolver: vi.fn().mockImplementation(function ClaudeRuntimePathResolverMock() {
    return { getRuntimePaths: mocks.getRuntimePaths }
  })
}))

const { markAgentWorkspaceTrusted } = await import('./agent-workspace-trust')

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getRuntimePaths.mockReturnValue({ configPath: '/custom/.claude.json' })
})

describe('markAgentWorkspaceTrusted', () => {
  it('no-ops for an undefined preset on a local host', async () => {
    await markAgentWorkspaceTrusted({
      preset: undefined,
      workspacePath: '/w',
      host: { kind: 'local' }
    })

    expect(mocks.markCursorWorkspaceTrusted).not.toHaveBeenCalled()
    expect(mocks.markRemoteAgentWorkspaceTrusted).not.toHaveBeenCalled()
  })

  it('no-ops for an undefined preset on a remote host', async () => {
    await markAgentWorkspaceTrusted({
      preset: undefined,
      workspacePath: '/w',
      host: { kind: 'remote', connectionId: 'ssh-1' }
    })

    expect(mocks.markRemoteAgentWorkspaceTrusted).not.toHaveBeenCalled()
  })

  it('routes cursor preset to markCursorWorkspaceTrusted locally', async () => {
    await markAgentWorkspaceTrusted({
      preset: 'cursor',
      workspacePath: '/w',
      host: { kind: 'local' }
    })

    expect(mocks.markCursorWorkspaceTrusted).toHaveBeenCalledWith('/w')
  })

  it('routes copilot preset to markCopilotFolderTrusted locally', async () => {
    await markAgentWorkspaceTrusted({
      preset: 'copilot',
      workspacePath: '/w',
      host: { kind: 'local' }
    })

    expect(mocks.markCopilotFolderTrusted).toHaveBeenCalledWith('/w')
  })

  it('routes codex preset to markCodexProjectTrusted locally', async () => {
    await markAgentWorkspaceTrusted({
      preset: 'codex',
      workspacePath: '/w',
      host: { kind: 'local' }
    })

    expect(mocks.markCodexProjectTrusted).toHaveBeenCalledWith('/w', undefined)
  })

  it('routes codex preset with codexHome to markCodexProjectTrusted locally', async () => {
    await markAgentWorkspaceTrusted({
      preset: 'codex',
      workspacePath: '/w',
      host: { kind: 'local' },
      codexHome: '/managed-codex-home'
    })

    expect(mocks.markCodexProjectTrusted).toHaveBeenCalledWith('/w', '/managed-codex-home')
  })

  it('routes claude preset without an override to markClaudeWorkspaceTrusted with no second arg', async () => {
    await markAgentWorkspaceTrusted({
      preset: 'claude',
      workspacePath: '/w',
      host: { kind: 'local' }
    })

    expect(mocks.markClaudeWorkspaceTrusted).toHaveBeenCalledWith('/w')
    expect(mocks.markClaudeWorkspaceTrusted.mock.calls[0]).toHaveLength(1)
    expect(mocks.getRuntimePaths).not.toHaveBeenCalled()
  })

  it('routes claude preset with claudeConfigDir to the resolved configPath', async () => {
    await markAgentWorkspaceTrusted({
      preset: 'claude',
      workspacePath: '/w',
      host: { kind: 'local' },
      claudeConfigDir: '/acct-2'
    })

    expect(mocks.getRuntimePaths).toHaveBeenCalledWith('/acct-2')
    expect(mocks.markClaudeWorkspaceTrusted).toHaveBeenCalledWith('/w', '/custom/.claude.json')
  })

  it('routes a remote host to markRemoteAgentWorkspaceTrusted without claudeConfigDir', async () => {
    await markAgentWorkspaceTrusted({
      preset: 'claude',
      workspacePath: '/w',
      host: { kind: 'remote', connectionId: 'ssh-1' }
    })

    expect(mocks.markRemoteAgentWorkspaceTrusted).toHaveBeenCalledWith({
      preset: 'claude',
      connectionId: 'ssh-1',
      workspacePath: '/w'
    })
  })

  it('routes a remote host to markRemoteAgentWorkspaceTrusted with claudeConfigDir', async () => {
    await markAgentWorkspaceTrusted({
      preset: 'claude',
      workspacePath: '/w',
      host: { kind: 'remote', connectionId: 'ssh-1' },
      claudeConfigDir: '/acct-2'
    })

    expect(mocks.markRemoteAgentWorkspaceTrusted).toHaveBeenCalledWith({
      preset: 'claude',
      connectionId: 'ssh-1',
      workspacePath: '/w',
      claudeConfigDir: '/acct-2'
    })
  })

  it('routes a remote codex preset to markRemoteAgentWorkspaceTrusted with codexHome', async () => {
    await markAgentWorkspaceTrusted({
      preset: 'codex',
      workspacePath: '/w',
      host: { kind: 'remote', connectionId: 'ssh-1' },
      codexHome: '/managed-codex-home'
    })

    expect(mocks.markRemoteAgentWorkspaceTrusted).toHaveBeenCalledWith({
      preset: 'codex',
      connectionId: 'ssh-1',
      workspacePath: '/w',
      codexHome: '/managed-codex-home'
    })
  })

  it('swallows a throwing local writer', async () => {
    mocks.markCursorWorkspaceTrusted.mockImplementation(() => {
      throw new Error('boom')
    })

    await expect(
      markAgentWorkspaceTrusted({
        preset: 'cursor',
        workspacePath: '/w',
        host: { kind: 'local' }
      })
    ).resolves.toBeUndefined()
  })

  it('swallows a throwing remote writer', async () => {
    mocks.markRemoteAgentWorkspaceTrusted.mockRejectedValue(new Error('boom'))

    await expect(
      markAgentWorkspaceTrusted({
        preset: 'claude',
        workspacePath: '/w',
        host: { kind: 'remote', connectionId: 'ssh-1' }
      })
    ).resolves.toBeUndefined()
  })
})
