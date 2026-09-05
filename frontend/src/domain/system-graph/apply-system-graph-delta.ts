import type { SystemGraph, SystemGraphDelta } from './types'

/** Pure, always returns a new graph (new Map) — mirrors composeFanOutGraph's immutability. */
export function applySystemGraphDelta(graph: SystemGraph, delta: SystemGraphDelta): SystemGraph {
  switch (delta.op) {
    case 'add-node': {
      const nodes = new Map(graph.nodes)
      nodes.set(delta.node.id, delta.node)
      return { ...graph, nodes }
    }
    case 'add-edge':
      return { ...graph, edges: [...graph.edges, delta.edge] }
    case 'set-node-state': {
      const existing = graph.nodes.get(delta.nodeId)
      if (existing === undefined) return graph
      const nodes = new Map(graph.nodes)
      const note = delta.note ?? existing.note
      nodes.set(delta.nodeId, {
        ...existing,
        state: delta.state,
        diff: delta.diff ?? existing.diff,
        ...(note !== undefined ? { note } : {})
      })
      return { ...graph, nodes }
    }
    case 'set-edge-kind': {
      const found = graph.edges.some((e) => e.from === delta.from && e.to === delta.to)
      if (!found) return graph
      return {
        ...graph,
        edges: graph.edges.map((e) =>
          e.from === delta.from && e.to === delta.to ? { ...e, kind: delta.kind } : e
        )
      }
    }
    default:
      return graph
  }
}
