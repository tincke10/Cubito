import type { SystemEdge, SystemGraph, SystemNode, SystemNodeId } from './types'

/** Pure transform, ergonomic demo authoring: array of nodes/edges -> SystemGraph. Mirrors build-graph.ts. */
export function buildSystemGraph(input: {
  nodes: readonly SystemNode[]
  edges: readonly SystemEdge[]
}): SystemGraph {
  const nodes = new Map<SystemNodeId, SystemNode>()
  for (const node of input.nodes) {
    nodes.set(node.id, node)
  }
  return { nodes, edges: input.edges }
}
