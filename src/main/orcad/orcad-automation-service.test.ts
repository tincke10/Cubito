import { describe, expect, it, vi } from 'vitest'
import { createOrcadHeadlessAutomationDispatcher } from './orcad-automation-service'

type Dispatcher = ReturnType<typeof createOrcadHeadlessAutomationDispatcher>
type Request = Parameters<Dispatcher>[0]

function request(overrides: Record<string, unknown> = {}): Request {
  return {
    automation: {
      id: 'a1',
      workspaceMode: 'existing',
      workspaceId: 'wt-1',
      agentId: 'claude',
      prompt: 'do it',
      ...overrides
    },
    run: { id: 'r1', title: 'Nightly', scheduledFor: Date.UTC(2026, 0, 1, 3) },
    target: { ok: true, repo: { id: 'repo-1' } }
  } as unknown as Request
}

function fakeRuntime(wait: { satisfied: boolean; blockedReason?: string } = { satisfied: true }) {
  return {
    createManagedWorktree: vi.fn(async () => ({
      worktree: { id: 'wt-new', displayName: 'auto-nightly' },
      startupTerminal: { handle: 'h-new', tabId: 'tab', paneKey: 'tab:leaf', ptyId: 'pty' }
    })),
    launchAgentTerminal: vi.fn(async () => ({
      handle: 'h-1',
      tabId: 'tab-1',
      paneKey: 'tab-1:leaf',
      ptyId: 'pty-1',
      worktreeId: 'wt-1'
    })),
    showManagedWorktree: vi.fn(async () => ({ displayName: 'Existing' })),
    waitForTerminal: vi.fn(async () => wait),
    readTerminal: vi.fn(async () => ({ tail: ['line 1', 'line 2'] }))
  }
}

describe('orcad headless automation dispatcher', () => {
  it('launches the agent in the existing workspace and completes on tui-idle', async () => {
    const runtime = fakeRuntime()
    const launch = await createOrcadHeadlessAutomationDispatcher(runtime as never)(request())
    expect(runtime.launchAgentTerminal).toHaveBeenCalledWith('id:wt-1', {
      agent: 'claude',
      prompt: 'do it',
      title: 'Nightly'
    })
    expect(launch).toMatchObject({
      workspaceId: 'wt-1',
      workspaceDisplayName: 'Existing',
      terminalSessionId: 'tab-1',
      terminalPaneKey: 'tab-1:leaf',
      terminalPtyId: 'pty-1'
    })
    const done = await launch.completion
    expect(runtime.waitForTerminal).toHaveBeenCalledWith('h-1', { condition: 'tui-idle' })
    expect(done).toMatchObject({ status: 'completed', error: null })
    expect(done?.outputSnapshot?.content).toBe('line 1\nline 2')
  })

  it('creates a managed worktree for new_per_run and uses its startup terminal', async () => {
    const runtime = fakeRuntime()
    const launch = await createOrcadHeadlessAutomationDispatcher(runtime as never)(
      request({ workspaceMode: 'new_per_run', workspaceId: null })
    )
    expect(runtime.createManagedWorktree).toHaveBeenCalledTimes(1)
    expect(runtime.launchAgentTerminal).not.toHaveBeenCalled()
    expect(launch.workspaceId).toBe('wt-new')
    await launch.completion
    expect(runtime.waitForTerminal).toHaveBeenCalledWith('h-new', { condition: 'tui-idle' })
  })

  it('fails the dispatch when no agent terminal started for the new workspace', async () => {
    const runtime = fakeRuntime()
    runtime.createManagedWorktree.mockResolvedValueOnce({
      worktree: { id: 'wt-new', displayName: 'x' },
      startupTerminal: undefined,
      warning: 'agent missing'
    } as never)
    await expect(
      createOrcadHeadlessAutomationDispatcher(runtime as never)(
        request({ workspaceMode: 'new_per_run' })
      )
    ).rejects.toThrow('agent missing')
  })

  it('rejects an existing-workspace run whose workspace is gone', async () => {
    const runtime = fakeRuntime()
    await expect(
      createOrcadHeadlessAutomationDispatcher(runtime as never)(request({ workspaceId: null }))
    ).rejects.toThrow('no longer available')
  })

  it('reports a blocked agent as dispatch_failed', async () => {
    const runtime = fakeRuntime({ satisfied: false, blockedReason: 'permission prompt' })
    const launch = await createOrcadHeadlessAutomationDispatcher(runtime as never)(request())
    await expect(launch.completion).resolves.toMatchObject({
      status: 'dispatch_failed',
      error: 'Automation agent is blocked: permission prompt.'
    })
  })
})
