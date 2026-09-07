import type { EngineSystemEdge, EngineSystemGraph, EngineSystemNode } from './system-graph-model'

/** Wire shape for `system.snapshot`: the Map-backed graph flattened to plain arrays. */
export type SystemGraphSnapshotWire = { nodes: EngineSystemNode[]; edges: EngineSystemEdge[] }

export function serializeSystemGraph(graph: EngineSystemGraph): SystemGraphSnapshotWire {
  return { nodes: [...graph.nodes.values()], edges: [...graph.edges] }
}

/** Frames emitted over the `system.watch` stream. */
export type SystemGraphWatchFrame =
  | { type: 'starting'; subscriptionId: string }
  | { type: 'ready'; subscriptionId: string; graph: SystemGraphSnapshotWire }
  | { type: 'graph'; graph: SystemGraphSnapshotWire }
  | { type: 'error'; message: string }
  | { type: 'end' }
