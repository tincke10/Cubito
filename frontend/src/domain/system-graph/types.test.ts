import { describe, expect, it } from 'vitest'
import {
  FEED_ROW_KINDS,
  SYSTEM_EDGE_KINDS,
  SYSTEM_NODE_KINDS,
  SYSTEM_NODE_STATES,
  emptySystemGraph
} from './types'
import type { FeedRowKind, SystemEdgeKind, SystemNodeKind, SystemNodeState } from './types'

describe('SYSTEM_NODE_KINDS', () => {
  it('lists all 4 kinds, matching the SystemNodeKind union, in order', () => {
    const expected: readonly SystemNodeKind[] = ['router', 'endpoint', 'service', 'database']
    expect(SYSTEM_NODE_KINDS).toEqual(expected)
  })
})

describe('SYSTEM_EDGE_KINDS', () => {
  it('lists all 3 kinds, matching the SystemEdgeKind union, in order', () => {
    const expected: readonly SystemEdgeKind[] = ['normal', 'flow', 'faint']
    expect(SYSTEM_EDGE_KINDS).toEqual(expected)
  })
})

describe('SYSTEM_NODE_STATES', () => {
  it('lists all 5 states, matching the SystemNodeState union, in order', () => {
    const expected: readonly SystemNodeState[] = ['idle', 'editing', 'naciendo', 'dirty', 'tested']
    expect(SYSTEM_NODE_STATES).toEqual(expected)
  })
})

describe('FEED_ROW_KINDS', () => {
  it('lists all 6 kinds, matching the FeedRowKind union, in order', () => {
    const expected: readonly FeedRowKind[] = ['read', 'edit', 'create', 'run', 'pass', 'diff']
    expect(FEED_ROW_KINDS).toEqual(expected)
  })
})

describe('emptySystemGraph', () => {
  it('returns an empty nodes map and no edges', () => {
    const graph = emptySystemGraph()
    expect(graph.nodes.size).toBe(0)
    expect(graph.edges).toEqual([])
  })
})
