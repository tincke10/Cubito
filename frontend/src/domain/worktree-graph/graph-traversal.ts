import type { WorktreeGraph, WorktreeId } from './types'

/** Never throws; an unresolvable parent or unknown id reads as `null`. */
export function parentOf(graph: WorktreeGraph, id: WorktreeId): WorktreeId | null {
  return graph.nodes.get(id)?.parentId ?? null
}

export function childrenOf(graph: WorktreeGraph, id: WorktreeId): readonly WorktreeId[] {
  const node = graph.nodes.get(id)
  if (!node) {
    return []
  }
  return node.childIds.filter((childId) => graph.nodes.has(childId))
}

/** Includes the node itself; roots use `rootIds`, others use the parent's `childIds`. */
export function siblingsOf(graph: WorktreeGraph, id: WorktreeId): readonly WorktreeId[] {
  const node = graph.nodes.get(id)
  if (!node) {
    return []
  }
  if (node.parentId === null) {
    return graph.rootIds
  }
  return childrenOf(graph, node.parentId)
}

/** Walks to the null-parent ancestor; returns `id` itself if already a root or unknown. */
export function rootOf(graph: WorktreeGraph, id: WorktreeId): WorktreeId {
  const visited = new Set<WorktreeId>()
  let current = id
  while (!visited.has(current)) {
    visited.add(current)
    const parentId = graph.nodes.get(current)?.parentId
    if (parentId === undefined || parentId === null) {
      return current
    }
    current = parentId
  }
  return current
}

/** Root is depth 0; guards against cycles with a visited set. */
export function depthOf(graph: WorktreeGraph, id: WorktreeId): number {
  const visited = new Set<WorktreeId>()
  let current = id
  let depth = 0
  while (!visited.has(current)) {
    visited.add(current)
    const parentId = graph.nodes.get(current)?.parentId
    if (parentId === undefined || parentId === null) {
      return depth
    }
    current = parentId
    depth += 1
  }
  return depth
}
