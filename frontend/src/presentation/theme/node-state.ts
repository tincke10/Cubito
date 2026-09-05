import type { DiffSummary, NodeActivity } from '../../domain/worktree-graph/node-activity'
import type { WorktreeGraph, WorktreeNode } from '../../domain/worktree-graph/types'

export type NodeState =
  | 'spawning'
  | 'archived'
  | 'waiting-input'
  | 'working'
  | 'dirty'
  | 'unread'
  | 'idle'

/** Runtime mirror of NodeState — the scene-purity ratchet (D8) builds its forbidden-literal list from this array. */
export const NODE_STATES = [
  'spawning',
  'archived',
  'waiting-input',
  'working',
  'dirty',
  'unread',
  'idle'
] as const satisfies readonly NodeState[]

export type NodeDecorations = {
  unreadDot: boolean
  diffLabel: DiffSummary | null
  waitingCallout: boolean
  selectionRing: boolean
  /** True when a different repo is active — this node's island should render dimmed. */
  dimmed: boolean
}

const hasNonzeroDiff = (activity: NodeActivity): boolean =>
  activity.diff !== null && activity.diff.added + activity.diff.removed > 0

/** Precedence: spawning > archived > waiting-input > working > dirty > unread > idle. */
export const deriveNodeState = (node: WorktreeNode): NodeState => {
  const { activity } = node
  if (activity.spawn !== null) return 'spawning'
  if (activity.isArchived) return 'archived'
  if (activity.agentStatus === 'waiting-input') return 'waiting-input'
  if (activity.agentStatus === 'working') return 'working'
  if (hasNonzeroDiff(activity)) return 'dirty'
  if (activity.isUnread) return 'unread'
  return 'idle'
}

export const deriveDecorations = (
  node: WorktreeNode,
  isSelected: boolean,
  activeRepoId?: string | null
): NodeDecorations => {
  const state = deriveNodeState(node)
  const { activity } = node
  return {
    unreadDot: activity.isUnread && state !== 'archived' && state !== 'spawning',
    diffLabel: state === 'archived' ? null : hasNonzeroDiff(activity) ? activity.diff : null,
    waitingCallout: state === 'waiting-input',
    selectionRing: isSelected,
    dimmed: activeRepoId != null && node.repoId !== activeRepoId
  }
}

export const countNodeStates = (
  graph: WorktreeGraph
): { total: number } & Record<NodeState, number> => {
  const counts = Object.fromEntries(NODE_STATES.map((state) => [state, 0])) as Record<
    NodeState,
    number
  >
  for (const node of graph.nodes.values()) {
    counts[deriveNodeState(node)] += 1
  }
  return { total: graph.nodes.size, ...counts }
}
