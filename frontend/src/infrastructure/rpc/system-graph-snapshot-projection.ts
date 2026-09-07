import type {
  SystemGraphSnapshot,
  SystemSnapshotEdge,
  SystemSnapshotNode
} from '../../application/ports/runtime-gateway'

/** Shared `system.snapshot`/`system.watch` wire projection — extracted so the unary snapshot
 *  call and the streamed graph frames apply the exact same node/edge coercion. */

const SNAPSHOT_NODE_KINDS = ['router', 'endpoint', 'service', 'database'] as const
const SNAPSHOT_EDGE_KINDS = ['normal', 'flow', 'faint'] as const

/** Projects a raw `system.snapshot`/`system.watch` node onto the local `SystemSnapshotNode` shape. */
export function toSystemSnapshotNode(node: {
  id?: unknown
  kind?: unknown
  label?: unknown
  method?: unknown
  path?: unknown
}): SystemSnapshotNode {
  return {
    id: typeof node.id === 'string' ? node.id : '',
    kind: (SNAPSHOT_NODE_KINDS as readonly unknown[]).includes(node.kind)
      ? (node.kind as SystemSnapshotNode['kind'])
      : 'service',
    label: typeof node.label === 'string' ? node.label : '',
    ...(typeof node.method === 'string' ? { method: node.method } : {}),
    ...(typeof node.path === 'string' ? { path: node.path } : {}),
    diff: null
  }
}

/** Projects a raw `system.snapshot`/`system.watch` edge onto the local `SystemSnapshotEdge` shape. */
export function toSystemSnapshotEdge(edge: {
  from?: unknown
  to?: unknown
  kind?: unknown
}): SystemSnapshotEdge {
  return {
    from: typeof edge.from === 'string' ? edge.from : '',
    to: typeof edge.to === 'string' ? edge.to : '',
    kind: (SNAPSHOT_EDGE_KINDS as readonly unknown[]).includes(edge.kind)
      ? (edge.kind as SystemSnapshotEdge['kind'])
      : 'normal'
  }
}

/** Projects a raw `system.snapshot`/`system.watch` graph onto the local `SystemGraphSnapshot` shape. */
export function toSystemGraphSnapshot(result: {
  nodes?: unknown
  edges?: unknown
}): SystemGraphSnapshot {
  return {
    nodes: Array.isArray(result.nodes)
      ? (result.nodes as Record<string, unknown>[]).map(toSystemSnapshotNode)
      : [],
    edges: Array.isArray(result.edges)
      ? (result.edges as Record<string, unknown>[]).map(toSystemSnapshotEdge)
      : []
  }
}
