import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  detect: vi.fn(),
  installClaude: vi.fn(),
  installCodex: vi.fn(),
  installGemini: vi.fn(),
  refresh: vi.fn()
}))

vi.mock('../agent-hooks/local-agent-cli-presence', () => ({
  detectLocalManagedAgentCliPresence: mocks.detect
}))

vi.mock('../agent-hooks/managed-agent-hook-registry', () => ({
  MANAGED_AGENT_HOOK_INSTALLERS: [
    ['claude', mocks.installClaude],
    ['codex', mocks.installCodex],
    ['gemini', mocks.installGemini]
  ],
  MANAGED_AGENT_HOOK_REMOVERS: [],
  MANAGED_AGENT_HOOK_ASYNC_REMOVERS: [],
  MANAGED_AGENT_HOOK_STATUS_READERS: [],
  MANAGED_AGENT_HOOK_SCRIPT_REFRESHERS: [
    ['claude', mocks.refresh],
    ['codex', mocks.refresh],
    ['gemini', mocks.refresh]
  ]
}))

import { installOrcadAgentHooks } from './orcad-agent-hook-install'

function installed(agent: string) {
  return {
    agent,
    state: 'installed',
    configPath: `/${agent}`,
    managedHooksPresent: true,
    detail: null
  }
}

describe('installOrcadAgentHooks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.installClaude.mockReturnValue(installed('claude'))
    mocks.installCodex.mockReturnValue(installed('codex'))
    mocks.installGemini.mockReturnValue(installed('gemini'))
    mocks.refresh.mockResolvedValue(undefined)
    mocks.detect.mockResolvedValue({
      claude: { state: 'found' },
      codex: { state: 'found' },
      gemini: { state: 'found' }
    })
  })

  it('installs every managed agent once when status hooks are enabled', async () => {
    const results = await installOrcadAgentHooks({ agentStatusHooksEnabled: true })

    expect(mocks.installClaude).toHaveBeenCalledTimes(1)
    expect(mocks.installCodex).toHaveBeenCalledTimes(1)
    expect(mocks.installGemini).toHaveBeenCalledTimes(1)
    expect(results.map((r) => r.agent)).toEqual(['claude', 'codex', 'gemini'])
  })

  it('installs when the setting was never persisted', async () => {
    await installOrcadAgentHooks({})

    expect(mocks.installClaude).toHaveBeenCalledTimes(1)
  })

  it('touches nothing when agentStatusHooksEnabled is false', async () => {
    const results = await installOrcadAgentHooks({ agentStatusHooksEnabled: false })

    expect(results).toEqual([])
    expect(mocks.detect).not.toHaveBeenCalled()
    expect(mocks.refresh).not.toHaveBeenCalled()
    expect(mocks.installClaude).not.toHaveBeenCalled()
    expect(mocks.installCodex).not.toHaveBeenCalled()
    expect(mocks.installGemini).not.toHaveBeenCalled()
  })

  it('keeps installing the other agents when one throws, and never rejects', async () => {
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.installCodex.mockImplementation(() => {
      throw new Error('boom')
    })

    const results = await installOrcadAgentHooks({ agentStatusHooksEnabled: true })

    expect(mocks.installClaude).toHaveBeenCalledTimes(1)
    expect(mocks.installGemini).toHaveBeenCalledTimes(1)
    expect(results.find((r) => r.agent === 'codex')?.state).toBe('error')
    errorLog.mockRestore()
  })
})
