import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  markClaudeWorkspaceTrusted: vi.fn(),
  markCodexProjectTrusted: vi.fn(async () => undefined),
  markCopilotFolderTrusted: vi.fn(),
  markCursorWorkspaceTrusted: vi.fn()
}))

vi.mock('../agent-trust-presets', () => mocks)

const { OrcaRuntimeService } = await import('./orca-runtime')

function createRuntime() {
  const runtime = new OrcaRuntimeService(
    {
      getSettings: () => ({
        disabledTuiAgents: [],
        agentCmdOverrides: {},
        agentDefaultArgs: {},
        agentDefaultEnv: {}
      })
    } as never,
    undefined,
    undefined
  )
  return runtime as unknown as {
    markLocalWorkspaceTrustedForAgent: (agent: string, workspacePath: string) => Promise<void>
  }
}

describe('markLocalWorkspaceTrustedForAgent — preset dispatch', () => {
  it('routes claude through markClaudeWorkspaceTrusted', async () => {
    const internal = createRuntime()

    await internal.markLocalWorkspaceTrustedForAgent('claude', '/tmp/worktree-1')

    expect(mocks.markClaudeWorkspaceTrusted).toHaveBeenCalledWith('/tmp/worktree-1')
    expect(mocks.markCopilotFolderTrusted).not.toHaveBeenCalled()
    expect(mocks.markCursorWorkspaceTrusted).not.toHaveBeenCalled()
    expect(mocks.markCodexProjectTrusted).not.toHaveBeenCalled()
  })
})
