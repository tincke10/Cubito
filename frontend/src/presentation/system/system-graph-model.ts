import type {
  SystemDiff,
  SystemEdgeKind,
  SystemGraph,
  SystemNodeId,
  SystemNodeKind,
  SystemNodeState
} from '../../domain/system-graph/types'

export type SystemGraphNodeView = {
  id: SystemNodeId
  kind: SystemNodeKind
  label: string
  method?: string
  x: number
  y: number
  state: SystemNodeState
  diff: SystemDiff | null
  note?: string
  cssClass: string
  highlighted: boolean
}

export type SystemGraphEdgeView = {
  from: SystemNodeId
  to: SystemNodeId
  kind: SystemEdgeKind
  cssClass: string
}

export type SystemGraphViewModel = {
  nodes: readonly SystemGraphNodeView[]
  edges: readonly SystemGraphEdgeView[]
}

/** Column order (design: router feeds endpoints feeds services feeds database). */
const TIER_BY_KIND: Record<SystemNodeKind, number> = {
  router: 0,
  endpoint: 1,
  service: 2,
  database: 3
}

const TIER_X_ORIGIN = 40
const TIER_X_SPACING = 280
const ROW_Y_ORIGIN = 40
const ROW_Y_SPACING = 120

const nodeCssClass = (kind: SystemNodeKind, state: SystemNodeState): string =>
  `system-node--${kind} system-node--${state}`

const edgeCssClass = (kind: SystemEdgeKind): string => `system-edge--${kind}`

/** Pure layout: tier by kind (x), row by insertion order within a tier (y). No DOM/Three. */
export function systemGraphViewModel(
  graph: SystemGraph,
  highlightedNodeId?: SystemNodeId
): SystemGraphViewModel {
  const rowByTier = new Map<number, number>()
  const nodes: SystemGraphNodeView[] = []
  for (const node of graph.nodes.values()) {
    const tier = TIER_BY_KIND[node.kind]
    const row = rowByTier.get(tier) ?? 0
    rowByTier.set(tier, row + 1)
    nodes.push({
      id: node.id,
      kind: node.kind,
      label: node.label,
      ...(node.method !== undefined ? { method: node.method } : {}),
      x: TIER_X_ORIGIN + tier * TIER_X_SPACING,
      y: ROW_Y_ORIGIN + row * ROW_Y_SPACING,
      state: node.state,
      diff: node.diff,
      ...(node.note !== undefined ? { note: node.note } : {}),
      cssClass: nodeCssClass(node.kind, node.state),
      highlighted: node.id === highlightedNodeId
    })
  }

  const edges = graph.edges.map((edge) => ({
    from: edge.from,
    to: edge.to,
    kind: edge.kind,
    cssClass: edgeCssClass(edge.kind)
  }))

  return { nodes, edges }
}
