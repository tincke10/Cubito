import { describe, expect, it } from 'vitest'
import {
  AGENT_ACTIVITY_DEFAULT_LIMIT,
  AGENT_ACTIVITY_MAX_WORKTREES,
  AGENT_ACTIVITY_RING_CAPACITY,
  createAgentActivityRing,
  type AgentActivityEvent
} from './agent-activity-ring'

function input(
  overrides: Partial<Omit<AgentActivityEvent, 'seq'>> = {}
): Omit<AgentActivityEvent, 'seq'> {
  return {
    at: 1000,
    worktreeId: 'repo-1::/repo/app',
    paneKey: 'pane-1',
    kind: 'edit',
    tool: 'Edit',
    target: 'src/a.ts',
    ...overrides
  }
}

describe('createAgentActivityRing', () => {
  it('assigns a per-worktree seq starting at 1, independent per worktree', () => {
    const ring = createAgentActivityRing()
    const first = ring.record(input({ worktreeId: 'wt-a' }))
    const second = ring.record(input({ worktreeId: 'wt-a' }))
    const other = ring.record(input({ worktreeId: 'wt-b' }))

    expect(first.seq).toBe(1)
    expect(second.seq).toBe(2)
    expect(other.seq).toBe(1)
  })

  it('reads all events oldest to newest with latestSeq', () => {
    const ring = createAgentActivityRing()
    ring.record(input({ worktreeId: 'wt-a', target: 'a' }))
    ring.record(input({ worktreeId: 'wt-a', target: 'b' }))
    ring.record(input({ worktreeId: 'wt-a', target: 'c' }))

    const page = ring.read('wt-a')

    expect(page.events.map((e) => e.target)).toEqual(['a', 'b', 'c'])
    expect(page.latestSeq).toBe(3)
  })

  it('filters by sinceSeq', () => {
    const ring = createAgentActivityRing()
    ring.record(input({ worktreeId: 'wt-a', target: 'a' }))
    ring.record(input({ worktreeId: 'wt-a', target: 'b' }))
    ring.record(input({ worktreeId: 'wt-a', target: 'c' }))

    const page = ring.read('wt-a', { sinceSeq: 1 })

    expect(page.events.map((e) => e.target)).toEqual(['b', 'c'])
    expect(page.latestSeq).toBe(3)
  })

  it('returns the full window when sinceSeq is greater than latestSeq', () => {
    const ring = createAgentActivityRing()
    ring.record(input({ worktreeId: 'wt-a', target: 'a' }))
    ring.record(input({ worktreeId: 'wt-a', target: 'b' }))

    const page = ring.read('wt-a', { sinceSeq: 99 })

    expect(page.events.map((e) => e.target)).toEqual(['a', 'b'])
    expect(page.latestSeq).toBe(2)
  })

  it('limit returns the newest N events', () => {
    const ring = createAgentActivityRing()
    for (let i = 0; i < 5; i++) {
      ring.record(input({ worktreeId: 'wt-a', target: `t${i}` }))
    }

    const page = ring.read('wt-a', { limit: 2 })

    expect(page.events.map((e) => e.target)).toEqual(['t3', 't4'])
    expect(page.latestSeq).toBe(5)
  })

  it('defaults the read limit', () => {
    expect(AGENT_ACTIVITY_DEFAULT_LIMIT).toBe(50)
  })

  it('evicts the oldest record once capacity is exceeded while latestSeq keeps climbing', () => {
    const ring = createAgentActivityRing({ capacity: 3 })
    for (let i = 0; i < 4; i++) {
      ring.record(input({ worktreeId: 'wt-a', target: `t${i}` }))
    }

    const page = ring.read('wt-a')

    expect(page.events.map((e) => e.target)).toEqual(['t1', 't2', 't3'])
    expect(page.latestSeq).toBe(4)
    expect(AGENT_ACTIVITY_RING_CAPACITY).toBe(200)
  })

  it('evicts the least-recently-written worktree once the worktree cap is exceeded', () => {
    const ring = createAgentActivityRing({ maxWorktrees: 2 })
    ring.record(input({ worktreeId: 'wt-a' }))
    ring.record(input({ worktreeId: 'wt-b' }))
    ring.record(input({ worktreeId: 'wt-c' }))

    expect(ring.read('wt-a')).toEqual({ events: [], latestSeq: 0 })
    expect(ring.read('wt-b').latestSeq).toBe(1)
    expect(ring.read('wt-c').latestSeq).toBe(1)
    expect(AGENT_ACTIVITY_MAX_WORKTREES).toBe(32)
  })

  it('returns an empty page for an unknown worktree', () => {
    const ring = createAgentActivityRing()

    expect(ring.read('never-seen')).toEqual({ events: [], latestSeq: 0 })
  })
})
