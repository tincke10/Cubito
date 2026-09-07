export const AGENT_ACTIVITY_RING_CAPACITY = 200
export const AGENT_ACTIVITY_MAX_WORKTREES = 32
export const AGENT_ACTIVITY_DEFAULT_LIMIT = 50

export type AgentActivityKind = 'read' | 'edit' | 'create' | 'run'

export type AgentActivityEvent = {
  seq: number
  at: number
  worktreeId: string
  paneKey: string
  agent?: string
  kind: AgentActivityKind
  tool: string
  target: string
}

export type AgentActivityPage = {
  events: readonly AgentActivityEvent[]
  latestSeq: number
}

export type AgentActivityRing = {
  record(input: Omit<AgentActivityEvent, 'seq'>): AgentActivityEvent
  read(worktreeId: string, options?: { sinceSeq?: number; limit?: number }): AgentActivityPage
}

type WorktreeBucket = {
  events: AgentActivityEvent[]
  nextSeq: number
}

const EMPTY_PAGE: AgentActivityPage = { events: [], latestSeq: 0 }

/** In-memory bounded ring: per-worktree seq/capacity, LRU-capped worktree count. */
export function createAgentActivityRing(options?: {
  capacity?: number
  maxWorktrees?: number
}): AgentActivityRing {
  const capacity = options?.capacity ?? AGENT_ACTIVITY_RING_CAPACITY
  const maxWorktrees = options?.maxWorktrees ?? AGENT_ACTIVITY_MAX_WORKTREES
  // Why: Map preserves insertion order, so re-inserting on write turns it into an LRU.
  const buckets = new Map<string, WorktreeBucket>()

  function touch(worktreeId: string): WorktreeBucket {
    const existing = buckets.get(worktreeId)
    if (existing) {
      buckets.delete(worktreeId)
      buckets.set(worktreeId, existing)
      return existing
    }
    if (buckets.size >= maxWorktrees) {
      const leastRecentlyWritten = buckets.keys().next().value
      if (leastRecentlyWritten !== undefined) {
        buckets.delete(leastRecentlyWritten)
      }
    }
    const created: WorktreeBucket = { events: [], nextSeq: 1 }
    buckets.set(worktreeId, created)
    return created
  }

  return {
    record(input) {
      const bucket = touch(input.worktreeId)
      const event: AgentActivityEvent = { ...input, seq: bucket.nextSeq }
      bucket.nextSeq += 1
      bucket.events.push(event)
      if (bucket.events.length > capacity) {
        bucket.events.shift()
      }
      return event
    },
    read(worktreeId, readOptions) {
      const bucket = buckets.get(worktreeId)
      if (!bucket) {
        return EMPTY_PAGE
      }
      const latestSeq = bucket.events.at(-1)?.seq ?? 0
      const sinceSeq = readOptions?.sinceSeq ?? 0
      // Why: a client whose sinceSeq raced past latestSeq (ring reset, host swap) gets the full window instead of an empty page.
      const filtered =
        sinceSeq > latestSeq ? bucket.events : bucket.events.filter((event) => event.seq > sinceSeq)
      const limit = readOptions?.limit ?? AGENT_ACTIVITY_DEFAULT_LIMIT
      const events = filtered.length > limit ? filtered.slice(filtered.length - limit) : filtered
      return { events, latestSeq }
    }
  }
}
