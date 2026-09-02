import { describe, expect, it, vi } from 'vitest'
import { createOrcadGateway } from './orcad-gateway'
import type { RpcCaller } from './orcad-gateway'

describe('createOrcadGateway', () => {
  it('lists worktrees via worktree.list', async () => {
    const worktrees = [{ id: 'w1' }]
    const call: RpcCaller = vi.fn(async () => ({
      id: 'x',
      ok: true as const,
      result: { worktrees },
      _meta: { runtimeId: 'rt' }
    }))
    const gateway = createOrcadGateway({ call })
    await expect(gateway.listWorktrees()).resolves.toEqual(worktrees)
    expect(call).toHaveBeenCalledWith('worktree.list')
  })

  it('rejects when the result payload has no worktrees array', async () => {
    const call: RpcCaller = async () => ({
      id: 'x',
      ok: true as const,
      result: { unexpected: true },
      _meta: { runtimeId: 'rt' }
    })
    const gateway = createOrcadGateway({ call })
    await expect(gateway.listWorktrees()).rejects.toThrow(/worktree\.list/)
  })

  it('behaves exactly as before when no options are passed (regression)', async () => {
    const worktrees = [{ id: 'w1' }]
    const call: RpcCaller = vi.fn(async () => ({
      id: 'x',
      ok: true as const,
      result: { worktrees },
      _meta: { runtimeId: 'rt' }
    }))
    const gateway = createOrcadGateway({ call })
    await expect(gateway.listWorktrees()).resolves.toEqual(worktrees)
  })

  it('calls onRuntimeId exactly once per listWorktrees() call with the response runtimeId', async () => {
    const worktrees = [{ id: 'w1' }]
    const call: RpcCaller = vi.fn(async () => ({
      id: 'x',
      ok: true as const,
      result: { worktrees },
      _meta: { runtimeId: 'rt-42' }
    }))
    const onRuntimeId = vi.fn()
    const gateway = createOrcadGateway({ call }, { onRuntimeId })
    await gateway.listWorktrees()
    expect(onRuntimeId).toHaveBeenCalledTimes(1)
    expect(onRuntimeId).toHaveBeenCalledWith('rt-42')

    await gateway.listWorktrees()
    expect(onRuntimeId).toHaveBeenCalledTimes(2)
  })

  it('does not call onRuntimeId when the call rejects', async () => {
    const error = new Error('boom')
    const call: RpcCaller = vi.fn(async () => {
      throw error
    })
    const onRuntimeId = vi.fn()
    const gateway = createOrcadGateway({ call }, { onRuntimeId })
    await expect(gateway.listWorktrees()).rejects.toThrow('boom')
    expect(onRuntimeId).not.toHaveBeenCalled()
  })

  it('stays frozen at listWorktrees only — no mutation methods added (CO-305 ratchet)', () => {
    const call: RpcCaller = vi.fn()
    const gateway = createOrcadGateway({ call })
    expect(Object.keys(gateway)).toEqual(['listWorktrees'])
  })
})
