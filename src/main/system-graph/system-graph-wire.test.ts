import { describe, expect, it } from 'vitest'
import type { EngineSystemEdge, EngineSystemGraph, EngineSystemNode } from './system-graph-model'
import { serializeSystemGraph } from './system-graph-wire'

describe('serializeSystemGraph', () => {
  it('serializes an empty graph to empty arrays', () => {
    const graph: EngineSystemGraph = { nodes: new Map(), edges: [] }
    expect(serializeSystemGraph(graph)).toEqual({ nodes: [], edges: [] })
  })

  it('flattens the node map to an array preserving insertion order', () => {
    const nodeA: EngineSystemNode = { id: 'a', kind: 'router', label: 'A', diff: null }
    const nodeB: EngineSystemNode = { id: 'b', kind: 'endpoint', label: 'B', diff: null }
    const graph: EngineSystemGraph = {
      nodes: new Map([
        ['a', nodeA],
        ['b', nodeB]
      ]),
      edges: []
    }

    expect(serializeSystemGraph(graph).nodes).toEqual([nodeA, nodeB])
  })

  it('copies edges rather than aliasing the graph array', () => {
    const edge: EngineSystemEdge = { from: 'a', to: 'b', kind: 'normal' }
    const graph: EngineSystemGraph = { nodes: new Map(), edges: [edge] }

    const wire = serializeSystemGraph(graph)
    ;(wire.edges as EngineSystemEdge[]).push({ from: 'b', to: 'a', kind: 'faint' })

    expect(graph.edges).toEqual([edge])
  })

  it('retains diff:null and optional method/path on nodes', () => {
    const routeNode: EngineSystemNode = {
      id: 'endpoint:get:/users',
      kind: 'endpoint',
      label: '/users',
      method: 'GET',
      path: '/users',
      diff: null
    }
    const graph: EngineSystemGraph = { nodes: new Map([[routeNode.id, routeNode]]), edges: [] }

    expect(serializeSystemGraph(graph).nodes[0]).toEqual(routeNode)
  })
})
