import type { WorktreeEdge, WorktreeGraph, WorktreeId, WorktreeNode } from './types'
import { inertActivity } from './node-activity'
import type { AgentStatus, DiffSummary, NodeActivity, SpawnProgress } from './node-activity'

/**
 * The subset of an orcad `worktree.list` record the graph is built from.
 * Mirrors the runtime payload; additive upstream fields are ignored.
 */
export type RawWorktreeRecord = {
  id: string
  branch: string
  parentWorktreeId: string | null
  childWorktreeIds: readonly string[]
  workspaceStatus: string
  git: {
    path: string
    isMainWorktree: boolean
  }
  agentStatus?: AgentStatus
  isUnread?: boolean
  lastActivityAt?: number
  isArchived?: boolean
  diff?: DiffSummary
  spawn?: SpawnProgress
}

/** Overrides only the optional fields a record actually supplies; the rest stays inert. */
function activityFromRecord(raw: RawWorktreeRecord): NodeActivity {
  const activity = inertActivity()
  if (raw.agentStatus !== undefined) {
    activity.agentStatus = raw.agentStatus
  }
  if (raw.isUnread !== undefined) {
    activity.isUnread = raw.isUnread
  }
  if (raw.lastActivityAt !== undefined) {
    activity.lastActivityAt = raw.lastActivityAt
  }
  if (raw.isArchived !== undefined) {
    activity.isArchived = raw.isArchived
  }
  if (raw.diff !== undefined) {
    activity.diff = raw.diff
  }
  if (raw.spawn !== undefined) {
    activity.spawn = raw.spawn
  }
  return activity
}

/**
 * Pure transform from runtime worktree records to the domain graph.
 * A parent reference that does not resolve within the record set is treated
 * as absent: the node becomes a root and no dangling edge is emitted.
 */
export function buildWorktreeGraph(records: readonly RawWorktreeRecord[]): WorktreeGraph {
  const nodes = new Map<WorktreeId, WorktreeNode>()

  for (const raw of records) {
    if (nodes.has(raw.id)) {
      continue
    }
    nodes.set(raw.id, {
      id: raw.id,
      branch: raw.branch,
      path: raw.git.path,
      status: raw.workspaceStatus,
      isMain: raw.git.isMainWorktree,
      kind: raw.git.isMainWorktree ? 'root' : 'worktree',
      parentId: raw.parentWorktreeId,
      childIds: [...raw.childWorktreeIds],
      activity: activityFromRecord(raw)
    })
  }

  const edges: WorktreeEdge[] = []
  const rootIds: WorktreeId[] = []

  for (const node of nodes.values()) {
    if (node.parentId !== null && nodes.has(node.parentId)) {
      edges.push({ from: node.parentId, to: node.id })
    } else {
      if (node.parentId !== null) {
        nodes.set(node.id, { ...node, parentId: null })
      }
      rootIds.push(node.id)
    }
  }

  return { nodes, edges, rootIds }
}
