import { describe, expect, it } from 'vitest'
import { NODE_STATES, countNodeStates, deriveDecorations, deriveNodeState } from './node-state'
import type { NodeState } from './node-state'
import { inertActivity } from '../../domain/worktree-graph/node-activity'
import type { NodeActivity } from '../../domain/worktree-graph/node-activity'
import type { WorktreeGraph, WorktreeNode } from '../../domain/worktree-graph/types'

const node = (activity: Partial<NodeActivity> = {}, overrides: Partial<WorktreeNode> = {}): WorktreeNode => ({
  id: 'repo::/path/main',
  branch: 'refs/heads/main',
  path: '/path/main',
  status: 'in-progress',
  isMain: true,
  kind: 'root',
  parentId: null,
  childIds: [],
  activity: { ...inertActivity(), ...activity },
  ...overrides
})

const graphOf = (nodes: readonly WorktreeNode[]): WorktreeGraph => ({
  nodes: new Map(nodes.map((n) => [n.id, n])),
  edges: [],
  rootIds: nodes.filter((n) => n.parentId === null).map((n) => n.id)
})

describe('NODE_STATES', () => {
  it('lists all 7 states, matching the NodeState union', () => {
    const expected: readonly NodeState[] = [
      'spawning',
      'archived',
      'waiting-input',
      'working',
      'dirty',
      'unread',
      'idle'
    ]
    expect(NODE_STATES).toEqual(expected)
  })
})

describe('deriveNodeState', () => {
  it('is total: never throws and returns a member of NODE_STATES', () => {
    const fixtures: readonly Partial<NodeActivity>[] = [
      {},
      { agentStatus: 'working' },
      { agentStatus: 'waiting-input' },
      { isUnread: true },
      { isArchived: true },
      { diff: { added: 3, removed: 1 } },
      { diff: { added: 0, removed: 0 } },
      { spawn: { phase: 'cloning', progress: 0.3 } },
      {
        agentStatus: 'working',
        isUnread: true,
        isArchived: true,
        diff: { added: 1, removed: 1 },
        spawn: { phase: 'cloning', progress: 0.1 }
      }
    ]
    for (const activity of fixtures) {
      const state = deriveNodeState(node(activity))
      expect(() => deriveNodeState(node(activity))).not.toThrow()
      expect(NODE_STATES).toContain(state)
    }
  })

  it.each<[string, Partial<NodeActivity>, NodeState]>([
    ['archived beats working', { isArchived: true, agentStatus: 'working' }, 'archived'],
    ['waiting-input beats unread', { agentStatus: 'waiting-input', isUnread: true }, 'waiting-input'],
    ['working beats a nonzero diff', { agentStatus: 'working', diff: { added: 4, removed: 0 } }, 'working'],
    [
      'a nonzero diff beats unread',
      { diff: { added: 1, removed: 0 }, isUnread: true, agentStatus: 'idle' },
      'dirty'
    ],
    ['unread alone', { isUnread: true }, 'unread'],
    ['all defaults', {}, 'idle']
  ])('precedence: %s', (_label, activity, expected) => {
    expect(deriveNodeState(node(activity))).toBe(expected)
  })

  it('a zero-valued diff never counts as dirty, falling through to unread', () => {
    expect(deriveNodeState(node({ diff: { added: 0, removed: 0 }, isUnread: true }))).toBe('unread')
  })

  it('a zero-valued diff with nothing else falls through to idle', () => {
    expect(deriveNodeState(node({ diff: { added: 0, removed: 0 } }))).toBe('idle')
  })

  // engine-blocked: no production path populates `spawn` yet, fixture only
  it('spawning overrides even archived (synthetic fixture)', () => {
    const activity: Partial<NodeActivity> = {
      spawn: { phase: 'cloning', progress: 0.3 },
      isArchived: true
    }
    expect(deriveNodeState(node(activity))).toBe('spawning')
  })
})

describe('deriveDecorations', () => {
  it.each<NodeState>([...NODE_STATES])(
    'selectionRing tracks isSelected unconditionally for state=%s',
    (state) => {
      const activityByState: Record<NodeState, Partial<NodeActivity>> = {
        spawning: { spawn: { phase: 'cloning', progress: 0.5 } },
        archived: { isArchived: true },
        'waiting-input': { agentStatus: 'waiting-input' },
        working: { agentStatus: 'working' },
        dirty: { diff: { added: 2, removed: 0 } },
        unread: { isUnread: true },
        idle: {}
      }
      const n = node(activityByState[state])
      expect(deriveNodeState(n)).toBe(state)
      expect(deriveDecorations(n, true).selectionRing).toBe(true)
      expect(deriveDecorations(n, false).selectionRing).toBe(false)
    }
  )

  it('unreadDot is true only when unread and not archived/spawning', () => {
    expect(deriveDecorations(node({ isUnread: true }), false).unreadDot).toBe(true)
    expect(deriveDecorations(node({ isUnread: true, isArchived: true }), false).unreadDot).toBe(false)
    expect(
      deriveDecorations(
        node({ isUnread: true, spawn: { phase: 'cloning', progress: 0.2 } }),
        false
      ).unreadDot
    ).toBe(false)
  })

  it('diffLabel surfaces the nonzero diff except when archived', () => {
    const diff = { added: 5, removed: 2 }
    expect(deriveDecorations(node({ diff }), false).diffLabel).toEqual(diff)
    expect(deriveDecorations(node({ diff, isArchived: true }), false).diffLabel).toBeNull()
    expect(deriveDecorations(node({ diff: { added: 0, removed: 0 } }), false).diffLabel).toBeNull()
    expect(deriveDecorations(node({}), false).diffLabel).toBeNull()
  })

  it('waitingCallout is true only in the waiting-input state', () => {
    expect(deriveDecorations(node({ agentStatus: 'waiting-input' }), false).waitingCallout).toBe(true)
    expect(deriveDecorations(node({ agentStatus: 'working' }), false).waitingCallout).toBe(false)
  })
})

describe('countNodeStates', () => {
  it('matches the mockup HUD fixture: 6 nodos · 2 agentes activos · 1 esperando input', () => {
    const nodes: readonly WorktreeNode[] = [
      node({}, { id: 'root' }),
      node({ agentStatus: 'working' }, { id: 'w1' }),
      node({ agentStatus: 'working' }, { id: 'w2' }),
      node({ agentStatus: 'waiting-input' }, { id: 'waiting' }),
      node({ diff: { added: 1, removed: 0 } }, { id: 'dirty' }),
      node({ isArchived: true }, { id: 'archived' })
    ]
    const counters = countNodeStates(graphOf(nodes))
    expect(counters).toEqual({ total: 6, working: 2, waitingInput: 1 })
  })

  it('total always equals graph.nodes.size, even for an empty graph', () => {
    expect(countNodeStates(graphOf([]))).toEqual({ total: 0, working: 0, waitingInput: 0 })
  })
})
