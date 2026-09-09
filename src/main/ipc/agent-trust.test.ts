import { beforeEach, describe, expect, it, vi } from 'vitest'

const handleHandlers = new Map<string, (event: unknown, ...args: unknown[]) => unknown>()
const removeHandler = vi.fn()

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: (event: unknown, ...args: unknown[]) => unknown) => {
      handleHandlers.set(channel, handler)
    },
    removeHandler
  }
}))

const mocks = vi.hoisted(() => ({
  markAgentWorkspaceTrusted: vi.fn(async () => undefined)
}))

vi.mock('../agent-workspace-trust', () => mocks)

const { registerAgentTrustHandlers } = await import('./agent-trust')

beforeEach(() => {
  vi.clearAllMocks()
  handleHandlers.clear()
  registerAgentTrustHandlers()
})

function invoke(args: unknown) {
  const handler = handleHandlers.get('agentTrust:markTrusted')
  if (!handler) {
    throw new Error('agentTrust:markTrusted handler was not registered')
  }
  return handler({}, args)
}

describe('agentTrust:markTrusted handler', () => {
  it('routes a claude preset through the shared dispatcher on a local host', async () => {
    await invoke({ preset: 'claude', workspacePath: '/repo/worktree' })

    expect(mocks.markAgentWorkspaceTrusted).toHaveBeenCalledWith({
      preset: 'claude',
      workspacePath: '/repo/worktree',
      host: { kind: 'local' }
    })
  })

  it('routes a claude preset through the shared dispatcher on a remote host', async () => {
    await invoke({ preset: 'claude', workspacePath: '/repo/worktree', connectionId: 'ssh-1' })

    expect(mocks.markAgentWorkspaceTrusted).toHaveBeenCalledWith({
      preset: 'claude',
      workspacePath: '/repo/worktree',
      host: { kind: 'remote', connectionId: 'ssh-1' }
    })
  })

  it('does nothing when workspacePath is missing', async () => {
    await invoke({ preset: 'claude' })

    expect(mocks.markAgentWorkspaceTrusted).not.toHaveBeenCalled()
  })
})
