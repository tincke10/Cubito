import { describe, expect, it, vi } from 'vitest'

// Why vi.hoisted: a plain top-level const races the hoisted vi.mock/import
// evaluation order and throws a TDZ error; vi.hoisted runs before both.
const { subscribeEnrichedStatus } = vi.hoisted(() => ({ subscribeEnrichedStatus: vi.fn() }))

vi.mock('./server', () => ({
  agentHookServer: { subscribeEnrichedStatus }
}))

import { ensureAgentActivityRecording } from './agent-activity-recording'

describe('ensureAgentActivityRecording', () => {
  it('subscribes exactly once and returns the same recorder across repeated calls', () => {
    const first = ensureAgentActivityRecording()
    const second = ensureAgentActivityRecording()
    const third = ensureAgentActivityRecording()

    expect(subscribeEnrichedStatus).toHaveBeenCalledTimes(1)
    expect(second).toBe(first)
    expect(third).toBe(first)
  })
})
