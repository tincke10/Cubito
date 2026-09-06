import type { WorktreeGraph, WorktreeId } from './types'
import { parentOf } from './graph-traversal'

/**
 * Resolves the branch diff mode should compare a worktree against.
 * Precedence: the node's own persisted baseRef, then the parent's branch,
 * then the repo's main worktree branch, else null (unknown base).
 */
export function resolveBaseRef(graph: WorktreeGraph, nodeId: WorktreeId): string | null {
  const node = graph.nodes.get(nodeId)
  if (!node) {
    return null
  }
  if (node.baseRef !== undefined) {
    return node.baseRef
  }

  const parentId = parentOf(graph, nodeId)
  if (parentId !== null) {
    const parent = graph.nodes.get(parentId)
    if (parent) {
      return parent.branch
    }
  }

  for (const candidate of graph.nodes.values()) {
    if (candidate.repoId === node.repoId && candidate.isMain) {
      return candidate.branch
    }
  }

  return null
}
