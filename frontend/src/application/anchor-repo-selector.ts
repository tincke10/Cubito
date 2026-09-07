import type { WorktreeGraph, WorktreeId } from '../domain/worktree-graph/types'

/**
 * `id:<repoId>` selector for the repo a spawn/fan-out anchor node belongs to, or null when there
 * is no anchor (rootless spawn) or the graph doesn't know it. Why: a child must land in its
 * PARENT's repo — resolving from the active repo spawned children into the wrong repository.
 */
export function repoSelectorForNode(
  graph: WorktreeGraph,
  nodeId: WorktreeId | null
): string | null {
  if (nodeId === null) return null
  const repoId = graph.nodes.get(nodeId)?.repoId
  return repoId ? `id:${repoId}` : null
}
