import type { WorktreeGraph, WorktreeId } from './types'
import { parentOf } from './graph-traversal'

/**
 * Resolves the branch diff mode should compare a worktree against.
 * Precedence: the node's own persisted baseRef, then the parent's branch,
 * then the repo's main worktree branch, else null (unknown base).
 */
/** A backend-rejected ('' fails `min(1)`) or all-whitespace ref is the same as absent. */
function nonEmpty(s: string | undefined): s is string {
  return typeof s === 'string' && s.trim() !== ''
}

export function resolveBaseRef(graph: WorktreeGraph, nodeId: WorktreeId): string | null {
  const node = graph.nodes.get(nodeId)
  if (!node) {
    return null
  }
  if (nonEmpty(node.baseRef)) {
    return node.baseRef
  }

  const parentId = parentOf(graph, nodeId)
  if (parentId !== null) {
    const parent = graph.nodes.get(parentId)
    if (parent && nonEmpty(parent.branch)) {
      return parent.branch
    }
  }

  for (const candidate of graph.nodes.values()) {
    if (candidate.repoId === node.repoId && candidate.isMain && nonEmpty(candidate.branch)) {
      return candidate.branch
    }
  }

  return null
}
