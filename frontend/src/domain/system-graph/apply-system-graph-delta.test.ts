import { describe, expect, it } from 'vitest'
import { applySystemGraphDelta } from './apply-system-graph-delta'
import { emptySystemGraph } from './types'
import type { SystemEdge, SystemGraph, SystemNode } from './types'

const node = (overrides: Partial<SystemNode> = {}): SystemNode => ({
  id: 'GET /users/:id',
  kind: 'endpoint',
  label: 'GET /users/:id',
  state: 'idle',
  diff: null,
  ...overrides
})

const edge = (overrides: Partial<SystemEdge> = {}): SystemEdge => ({
  from: 'router',
  to: 'GET /users/:id',
  kind: 'normal',
  ...overrides
})

const graphOf = (nodes: readonly SystemNode[], edges: readonly SystemEdge[] = []): SystemGraph => ({
  nodes: new Map(nodes.map((n) => [n.id, n])),
  edges
})

describe('applySystemGraphDelta', () => {
  it('add-node appends a node to a new map, leaving the input untouched', () => {
    const before = emptySystemGraph()
    const after = applySystemGraphDelta(before, { op: 'add-node', node: node() })
    expect(before.nodes.size).toBe(0)
    expect(after.nodes.get('GET /users/:id')).toEqual(node())
    expect(after.nodes).not.toBe(before.nodes)
  })

  it('add-edge appends an edge, leaving the input untouched', () => {
    const before = emptySystemGraph()
    const after = applySystemGraphDelta(before, { op: 'add-edge', edge: edge() })
    expect(before.edges).toEqual([])
    expect(after.edges).toEqual([edge()])
  })

  it('set-node-state replaces state and merges diff/note only when provided', () => {
    const before = graphOf([node({ state: 'idle', note: 'initial' })])
    const after = applySystemGraphDelta(before, {
      op: 'set-node-state',
      nodeId: 'GET /users/:id',
      state: 'editing'
    })
    expect(after.nodes.get('GET /users/:id')?.state).toBe('editing')
    expect(after.nodes.get('GET /users/:id')?.diff).toBeNull()
    expect(after.nodes.get('GET /users/:id')?.note).toBe('initial')
    expect(before.nodes.get('GET /users/:id')?.state).toBe('idle')

    const withDiffAndNote = applySystemGraphDelta(before, {
      op: 'set-node-state',
      nodeId: 'GET /users/:id',
      state: 'dirty',
      diff: { added: 34, removed: 8 },
      note: 'editando ahora'
    })
    expect(withDiffAndNote.nodes.get('GET /users/:id')?.diff).toEqual({ added: 34, removed: 8 })
    expect(withDiffAndNote.nodes.get('GET /users/:id')?.note).toBe('editando ahora')
  })

  it('set-node-state on an unknown id is a no-op', () => {
    const before = graphOf([node()])
    const after = applySystemGraphDelta(before, {
      op: 'set-node-state',
      nodeId: 'unknown',
      state: 'tested'
    })
    expect(after.nodes).toEqual(before.nodes)
  })

  it('set-edge-kind replaces the matching edge kind, leaving others untouched', () => {
    const other = edge({ from: 'router', to: 'other', kind: 'normal' })
    const before = graphOf([], [edge(), other])
    const after = applySystemGraphDelta(before, {
      op: 'set-edge-kind',
      from: 'router',
      to: 'GET /users/:id',
      kind: 'flow'
    })
    expect(after.edges).toContainEqual({ ...edge(), kind: 'flow' })
    expect(after.edges).toContainEqual(other)
    expect(before.edges).toEqual([edge(), other])
  })

  it('set-edge-kind on an unknown pair is a no-op', () => {
    const before = graphOf([], [edge()])
    const after = applySystemGraphDelta(before, {
      op: 'set-edge-kind',
      from: 'router',
      to: 'unknown',
      kind: 'flow'
    })
    expect(after.edges).toEqual(before.edges)
  })
})
