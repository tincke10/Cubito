import { describe, expect, it, vi } from 'vitest'
import { isStreamingMethod } from '../core'
import { AGENT_ACTIVITY_METHODS } from './agent-activity-methods'
import { ALL_RPC_METHODS } from './index'
import { MOBILE_RPC_METHOD_ALLOWLIST } from '../../runtime-rpc'

const read = vi.fn()

// Why: no hook server should boot for a unit test of the RPC layer.
vi.mock('../../../agent-hooks/agent-activity-recording', () => ({
  ensureAgentActivityRecording: vi.fn(() => ({ read }))
}))

function method(name: string) {
  const found = AGENT_ACTIVITY_METHODS.find((candidate) => candidate.name === name)
  if (!found) {
    throw new Error(`Missing method ${name}`)
  }
  return found
}

describe('agent.activity RPC method', () => {
  it('forwards worktree/sinceSeq/limit and returns the page unchanged', async () => {
    const page = { events: [], latestSeq: 5 }
    read.mockReturnValue(page)
    const activity = method('agent.activity')
    if (isStreamingMethod(activity)) {
      throw new Error('agent.activity must be a request method')
    }

    const result = await activity.handler(
      { worktree: 'repo-1::/repo/app', sinceSeq: 2, limit: 10 },
      {} as never
    )

    expect(read).toHaveBeenCalledWith('repo-1::/repo/app', { sinceSeq: 2, limit: 10 })
    expect(result).toBe(page)
  })

  it('omits sinceSeq/limit keys entirely when not provided', async () => {
    read.mockReturnValue({ events: [], latestSeq: 0 })
    const activity = method('agent.activity')
    if (isStreamingMethod(activity)) {
      throw new Error('agent.activity must be a request method')
    }

    await activity.handler({ worktree: 'repo-1::/repo/app' }, {} as never)

    expect(read).toHaveBeenCalledWith('repo-1::/repo/app', {})
  })

  it('rejects a missing or empty worktree', () => {
    const activity = method('agent.activity')
    expect(activity.params?.safeParse({}).success).toBe(false)
    expect(activity.params?.safeParse({ worktree: '' }).success).toBe(false)
  })

  it.each([0, 201, -1, 1.5])('rejects an invalid limit of %s', (limit) => {
    const activity = method('agent.activity')
    expect(activity.params?.safeParse({ worktree: 'wt-1', limit }).success).toBe(false)
  })

  it('accepts a limit of 200', () => {
    const activity = method('agent.activity')
    expect(activity.params?.safeParse({ worktree: 'wt-1', limit: 200 }).success).toBe(true)
  })

  it('rejects a negative sinceSeq', () => {
    const activity = method('agent.activity')
    expect(activity.params?.safeParse({ worktree: 'wt-1', sinceSeq: -1 }).success).toBe(false)
  })
})

describe('agent.activity registration', () => {
  it('is present in ALL_RPC_METHODS', () => {
    expect(ALL_RPC_METHODS.some((candidate) => candidate.name === 'agent.activity')).toBe(true)
  })

  it('is present in MOBILE_RPC_METHOD_ALLOWLIST', () => {
    expect(MOBILE_RPC_METHOD_ALLOWLIST.has('agent.activity')).toBe(true)
  })
})
