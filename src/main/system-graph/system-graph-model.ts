/** Engine-side system graph model (Change A). Structurally aligned to
 * frontend/src/domain/system-graph/types.ts kind/edge-kind sets. */

export type EngineSystemNodeId = string

export type EngineSystemNodeKind = 'router' | 'endpoint' | 'service' | 'database'
export const ENGINE_SYSTEM_NODE_KINDS = [
  'router',
  'endpoint',
  'service',
  'database'
] as const satisfies readonly EngineSystemNodeKind[]

export type EngineSystemEdgeKind = 'normal' | 'flow' | 'faint'
export const ENGINE_SYSTEM_EDGE_KINDS = [
  'normal',
  'flow',
  'faint'
] as const satisfies readonly EngineSystemEdgeKind[]

// Why: diff is always null in Change A — real add/remove counts need git diff (Change B).
export type EngineSystemNode = {
  id: EngineSystemNodeId
  kind: EngineSystemNodeKind
  label: string
  method?: string
  path?: string
  diff: null
}

export type EngineSystemEdge = {
  from: EngineSystemNodeId
  to: EngineSystemNodeId
  kind: EngineSystemEdgeKind
}

export type EngineSystemGraph = {
  nodes: ReadonlyMap<EngineSystemNodeId, EngineSystemNode>
  edges: readonly EngineSystemEdge[]
}

export const emptyEngineSystemGraph = (): EngineSystemGraph => ({ nodes: new Map(), edges: [] })
