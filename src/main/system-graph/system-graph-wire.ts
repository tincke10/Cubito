import type { EngineSystemEdge, EngineSystemGraph, EngineSystemNode } from './system-graph-model'

/** Wire shape for `system.snapshot`: the Map-backed graph flattened to plain arrays. */
export type SystemGraphSnapshotWire = { nodes: EngineSystemNode[]; edges: EngineSystemEdge[] }

export function serializeSystemGraph(graph: EngineSystemGraph): SystemGraphSnapshotWire {
  return { nodes: [...graph.nodes.values()], edges: [...graph.edges] }
}
