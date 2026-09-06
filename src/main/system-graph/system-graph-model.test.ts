import { describe, expect, it } from 'vitest'
import {
  ENGINE_SYSTEM_EDGE_KINDS,
  ENGINE_SYSTEM_NODE_KINDS,
  emptyEngineSystemGraph,
  type EngineSystemEdge,
  type EngineSystemNode
} from './system-graph-model'

describe('emptyEngineSystemGraph', () => {
  it('returns an empty graph with a Map for nodes and no edges', () => {
    const graph = emptyEngineSystemGraph()
    expect(graph.nodes).toBeInstanceOf(Map)
    expect(graph.nodes.size).toBe(0)
    expect(graph.edges).toEqual([])
  })
})

describe('EngineSystemNode', () => {
  it('constructs a node with diff always null in Change A', () => {
    const node: EngineSystemNode = {
      id: 'router:app',
      kind: 'router',
      label: 'app',
      method: 'GET',
      path: '/users',
      diff: null
    }
    expect(node).toEqual({
      id: 'router:app',
      kind: 'router',
      label: 'app',
      method: 'GET',
      path: '/users',
      diff: null
    })
  })

  it('allows method and path to be omitted for non-route kinds', () => {
    const node: EngineSystemNode = {
      id: 'db:pg',
      kind: 'database',
      label: 'PostgreSQL',
      diff: null
    }
    expect(node.method).toBeUndefined()
    expect(node.path).toBeUndefined()
  })
})

describe('EngineSystemEdge', () => {
  it('constructs an edge between two node ids', () => {
    const edge: EngineSystemEdge = { from: 'a', to: 'b', kind: 'flow' }
    expect(edge).toEqual({ from: 'a', to: 'b', kind: 'flow' })
  })
})

describe('kind sets align with frontend/src/domain/system-graph/types.ts', () => {
  it('matches SYSTEM_NODE_KINDS', () => {
    expect(ENGINE_SYSTEM_NODE_KINDS).toEqual(['router', 'endpoint', 'service', 'database'])
  })

  it('matches SYSTEM_EDGE_KINDS', () => {
    expect(ENGINE_SYSTEM_EDGE_KINDS).toEqual(['normal', 'flow', 'faint'])
  })
})
