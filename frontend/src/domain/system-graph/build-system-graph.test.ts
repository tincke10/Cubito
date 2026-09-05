import { describe, expect, it } from 'vitest'
import { buildSystemGraph } from './build-system-graph'
import type { SystemEdge, SystemNode } from './types'

const node = (overrides: Partial<SystemNode> = {}): SystemNode => ({
  id: 'router',
  kind: 'router',
  label: 'api/routes',
  state: 'idle',
  diff: null,
  ...overrides
})

describe('buildSystemGraph', () => {
  it('returns emptySystemGraph()-shaped output for empty input', () => {
    const graph = buildSystemGraph({ nodes: [], edges: [] })
    expect(graph.nodes.size).toBe(0)
    expect(graph.edges).toEqual([])
  })

  it('indexes nodes by id', () => {
    const a = node({ id: 'router' })
    const b = node({ id: 'GET /users/:id', kind: 'endpoint', label: 'GET /users/:id' })
    const graph = buildSystemGraph({ nodes: [a, b], edges: [] })
    expect(graph.nodes.get('router')).toEqual(a)
    expect(graph.nodes.get('GET /users/:id')).toEqual(b)
    expect(graph.nodes.size).toBe(2)
  })

  it('a duplicate id: last one wins', () => {
    const first = node({ id: 'router', label: 'first' })
    const second = node({ id: 'router', label: 'second' })
    const graph = buildSystemGraph({ nodes: [first, second], edges: [] })
    expect(graph.nodes.get('router')?.label).toBe('second')
    expect(graph.nodes.size).toBe(1)
  })

  it('passes edges through unchanged', () => {
    const edges: readonly SystemEdge[] = [{ from: 'router', to: 'GET /users/:id', kind: 'normal' }]
    const graph = buildSystemGraph({ nodes: [], edges })
    expect(graph.edges).toEqual(edges)
  })
})
