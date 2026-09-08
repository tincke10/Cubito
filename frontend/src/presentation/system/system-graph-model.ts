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
  width: number
  height: number
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
  /** Design-space canvas (mockup 1440 − 400 feed); the SVG viewBox scales it to fit. */
  canvas: { width: number; height: number }
}

/** Column order (design: router feeds endpoints feeds services feeds database). */
const TIER_BY_KIND: Record<SystemNodeKind, number> = {
  router: 0,
  endpoint: 1,
  service: 2,
  database: 3
}

/** Box sizes per kind, verbatim from VistaSistema.dc.html's rect/db-svg dimensions. */
export const NODE_BOX_SIZE: Record<SystemNodeKind, { width: number; height: number }> = {
  router: { width: 200, height: 44 },
  endpoint: { width: 250, height: 44 },
  service: { width: 150, height: 44 },
  database: { width: 100, height: 130 }
}

const TIER_X_ORIGIN = 40
const TIER_X_SPACING = 280
/** Design-space top margin only — the HUD band is screen-space, reserved by the SVG's CSS top
 *  (index.html .cubito-system-graph), so it never shrinks with the viewBox scale. */
export const SYSTEM_GRAPH_TOP_MARGIN = 24
const ROW_Y_ORIGIN = SYSTEM_GRAPH_TOP_MARGIN
const ROW_Y_SPACING = 120
export const SYSTEM_CANVAS_WIDTH = 1040
/** Room under the lowest box for its diff/note lines (element draws them up to y+76). */
const CANVAS_BOTTOM_MARGIN = 96

const canvasHeight = (nodes: readonly SystemGraphNodeView[]): number =>
  Math.max(
    ROW_Y_ORIGIN + ROW_Y_SPACING,
    ...nodes.map((node) => node.y + node.height + CANVAS_BOTTOM_MARGIN)
  )

const nodeCssClass = (kind: SystemNodeKind, state: SystemNodeState): string =>
  `system-node--${kind} system-node--${state}`

const edgeCssClass = (kind: SystemEdgeKind): string => `system-edge--${kind}`

/** Engine/demo labels arrive as "POST /path"; the badge already shows the method. */
const labelWithoutMethod = (label: string, method: string | undefined): string =>
  method !== undefined && label.startsWith(`${method} `) ? label.slice(method.length + 1) : label

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
      label: labelWithoutMethod(node.label, node.method),
      ...(node.method !== undefined ? { method: node.method } : {}),
      x: TIER_X_ORIGIN + tier * TIER_X_SPACING,
      y: ROW_Y_ORIGIN + row * ROW_Y_SPACING,
      ...NODE_BOX_SIZE[node.kind],
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

  return { nodes, edges, canvas: { width: SYSTEM_CANVAS_WIDTH, height: canvasHeight(nodes) } }
}
