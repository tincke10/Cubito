import { describe, expect, it, vi } from 'vitest'
import { createAgentActivityMethods } from './orcad-agent-activity-gateway'
import type { RpcCaller } from './orcad-gateway'

const okFrame = (result: unknown) => ({
  id: 'x',
  ok: true as const,
  result,
  _meta: { runtimeId: 'rt' }
})

describe('createAgentActivityMethods', () => {
  it('calls agent.activity with worktree, sinceSeq and limit when given', async () => {
    const call: RpcCaller = vi.fn(async () => okFrame({ events: [], latestSeq: 0 }))
    const gateway = createAgentActivityMethods({ call })
    await gateway.agentActivity({ worktree: 'w1', sinceSeq: 3, limit: 10 })
    expect(call).toHaveBeenCalledWith('agent.activity', { worktree: 'w1', sinceSeq: 3, limit: 10 })
  })

  it('omits sinceSeq and limit keys when not given', async () => {
    const call: RpcCaller = vi.fn(async () => okFrame({ events: [], latestSeq: 0 }))
    const gateway = createAgentActivityMethods({ call })
    await gateway.agentActivity({ worktree: 'w1' })
    expect(call).toHaveBeenCalledWith('agent.activity', { worktree: 'w1' })
  })

  it('maps a full row', async () => {
    const call: RpcCaller = vi.fn(async () =>
      okFrame({
        events: [
          {
            seq: 5,
            at: 1000,
            worktreeId: 'w1',
            paneKey: 'p1',
            agent: 'claude',
            kind: 'edit',
            tool: 'Edit',
            target: 'src/x.ts'
          }
        ],
        latestSeq: 5
      })
    )
    const gateway = createAgentActivityMethods({ call })
    const page = await gateway.agentActivity({ worktree: 'w1' })
    expect(page).toEqual({
      events: [
        { seq: 5, at: 1000, agent: 'claude', kind: 'edit', tool: 'Edit', target: 'src/x.ts' }
      ],
      latestSeq: 5
    })
  })

  it('maps a row with no agent (optional)', async () => {
    const call: RpcCaller = vi.fn(async () =>
      okFrame({
        events: [
          {
            seq: 1,
            at: 500,
            worktreeId: 'w1',
            paneKey: 'p1',
            kind: 'read',
            tool: 'Read',
            target: 'a.ts'
          }
        ],
        latestSeq: 1
      })
    )
    const gateway = createAgentActivityMethods({ call })
    const page = await gateway.agentActivity({ worktree: 'w1' })
    expect(page.events).toEqual([{ seq: 1, at: 500, kind: 'read', tool: 'Read', target: 'a.ts' }])
  })

  it('drops a row with an unknown kind', async () => {
    const call: RpcCaller = vi.fn(async () =>
      okFrame({
        events: [
          {
            seq: 1,
            at: 500,
            worktreeId: 'w1',
            paneKey: 'p1',
            kind: 'delete',
            tool: 'X',
            target: 'a.ts'
          },
          {
            seq: 2,
            at: 600,
            worktreeId: 'w1',
            paneKey: 'p1',
            kind: 'run',
            tool: 'Bash',
            target: 'pnpm test'
          }
        ],
        latestSeq: 2
      })
    )
    const gateway = createAgentActivityMethods({ call })
    const page = await gateway.agentActivity({ worktree: 'w1' })
    expect(page.events).toEqual([
      { seq: 2, at: 600, kind: 'run', tool: 'Bash', target: 'pnpm test' }
    ])
  })

  it('drops a row with a non-numeric seq', async () => {
    const call: RpcCaller = vi.fn(async () =>
      okFrame({
        events: [
          {
            seq: '5',
            at: 500,
            worktreeId: 'w1',
            paneKey: 'p1',
            kind: 'read',
            tool: 'Read',
            target: 'a.ts'
          }
        ],
        latestSeq: 5
      })
    )
    const gateway = createAgentActivityMethods({ call })
    const page = await gateway.agentActivity({ worktree: 'w1' })
    expect(page.events).toEqual([])
  })

  it('drops a row with a non-numeric at', async () => {
    const call: RpcCaller = vi.fn(async () =>
      okFrame({
        events: [
          {
            seq: 1,
            at: 'now',
            worktreeId: 'w1',
            paneKey: 'p1',
            kind: 'read',
            tool: 'Read',
            target: 'a.ts'
          }
        ],
        latestSeq: 1
      })
    )
    const gateway = createAgentActivityMethods({ call })
    const page = await gateway.agentActivity({ worktree: 'w1' })
    expect(page.events).toEqual([])
  })

  it('falls back to an empty page when events/latestSeq are missing', async () => {
    const call: RpcCaller = vi.fn(async () => okFrame({}))
    const gateway = createAgentActivityMethods({ call })
    const page = await gateway.agentActivity({ worktree: 'w1' })
    expect(page).toEqual({ events: [], latestSeq: 0 })
  })
})
