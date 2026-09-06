import { buildSystemGraph } from '../domain/system-graph/build-system-graph'
import type { SystemGraphSnapshot } from './ports/runtime-gateway'
import type { SystemGraph, SystemNode } from '../domain/system-graph/types'

/** Wire snapshot node -> domain SystemNode: default 'idle' state, no note. Pure, no DOM/IO. */
function toSystemNode(node: SystemGraphSnapshot['nodes'][number]): SystemNode {
  return {
    id: node.id,
    kind: node.kind,
    label: node.label,
    ...(node.method !== undefined ? { method: node.method } : {}),
    ...(node.path !== undefined ? { path: node.path } : {}),
    state: 'idle',
    diff: null
  }
}

/** Maps a `system.snapshot` wire result onto a domain `SystemGraph` (replace-graph payload). */
export function mapSnapshotToSystemGraph(snapshot: SystemGraphSnapshot): SystemGraph {
  return buildSystemGraph({
    nodes: snapshot.nodes.map(toSystemNode),
    edges: snapshot.edges.map((edge) => ({ from: edge.from, to: edge.to, kind: edge.kind }))
  })
}
