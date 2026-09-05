export type SystemNodeId = string

export type SystemNodeKind = 'router' | 'endpoint' | 'service' | 'database'
export const SYSTEM_NODE_KINDS = [
  'router',
  'endpoint',
  'service',
  'database'
] as const satisfies readonly SystemNodeKind[]

export type SystemEdgeKind = 'normal' | 'flow' | 'faint'
export const SYSTEM_EDGE_KINDS = [
  'normal',
  'flow',
  'faint'
] as const satisfies readonly SystemEdgeKind[]

export type SystemNodeState = 'idle' | 'editing' | 'naciendo' | 'dirty' | 'tested'
export const SYSTEM_NODE_STATES = [
  'idle',
  'editing',
  'naciendo',
  'dirty',
  'tested'
] as const satisfies readonly SystemNodeState[]

/** Re-declared (not imported from worktree-graph) to keep the domain independent. */
export type SystemDiff = { added: number; removed: number }

export type SystemNode = {
  id: SystemNodeId
  kind: SystemNodeKind
  label: string
  method?: string
  state: SystemNodeState
  diff: SystemDiff | null
  note?: string
}

export type SystemEdge = {
  from: SystemNodeId
  to: SystemNodeId
  kind: SystemEdgeKind
}

export type SystemGraph = {
  nodes: ReadonlyMap<SystemNodeId, SystemNode>
  edges: readonly SystemEdge[]
}

export const emptySystemGraph = (): SystemGraph => ({ nodes: new Map(), edges: [] })

export type FeedRowKind = 'read' | 'edit' | 'create' | 'run' | 'pass' | 'diff'
export const FEED_ROW_KINDS = [
  'read',
  'edit',
  'create',
  'run',
  'pass',
  'diff'
] as const satisfies readonly FeedRowKind[]

export type FeedRow = {
  id: string
  time: string
  kind: FeedRowKind
  text: string
  detail?: string
  highlighted?: boolean
}

export type SystemGraphDelta =
  | { op: 'add-node'; node: SystemNode }
  | { op: 'add-edge'; edge: SystemEdge }
  | {
      op: 'set-node-state'
      nodeId: SystemNodeId
      state: SystemNodeState
      diff?: SystemDiff
      note?: string
    }
  | { op: 'set-edge-kind'; from: SystemNodeId; to: SystemNodeId; kind: SystemEdgeKind }
