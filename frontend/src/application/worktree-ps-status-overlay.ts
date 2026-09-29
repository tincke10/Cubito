import type { AgentStatus } from '../domain/worktree-graph/node-activity'
import type { WorktreeGraph, WorktreeId, WorktreeNode } from '../domain/worktree-graph/types'
import { mapPsStatusToAgentStatus } from './fan-out-model'
import type { WorktreePsRow } from './ports/runtime-gateway'

/**
 * Projects `worktree.ps` onto every node's agentStatus. `rows === null` means the ps call failed:
 * carry the previous graph's status over (stale beats flickering to idle).
 */
export function applyPsStatusToGraph(
  graph: WorktreeGraph,
  rows: readonly WorktreePsRow[] | null,
  previous: WorktreeGraph | null
): WorktreeGraph {
  const statusById = new Map<WorktreeId, AgentStatus>()
  if (rows !== null) {
    for (const row of rows) statusById.set(row.worktreeId, mapPsStatusToAgentStatus(row.status))
  }

  const nodes = new Map<WorktreeId, WorktreeNode>()
  for (const [id, node] of graph.nodes) {
    const agentStatus =
      rows !== null
        ? (statusById.get(id) ?? 'idle')
        : (previous?.nodes.get(id)?.activity.agentStatus ?? 'idle')
    nodes.set(id, { ...node, activity: { ...node.activity, agentStatus } })
  }
  return { ...graph, nodes }
}
