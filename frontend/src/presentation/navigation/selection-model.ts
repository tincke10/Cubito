import type { WorktreeGraph, WorktreeId } from '../../domain/worktree-graph/types'
import { childrenOf, parentOf, siblingsOf } from '../../domain/worktree-graph/graph-traversal'
import type { NavDirection } from './keymap'

/** The main root when present, else the first root, else `null` for an empty graph. */
export function initialSelection(graph: WorktreeGraph): WorktreeId | null {
  for (const rootId of graph.rootIds) {
    if (graph.nodes.get(rootId)?.isMain === true) {
      return rootId
    }
  }
  return graph.rootIds[0] ?? null
}

const clampIndex = (index: number, length: number): number => Math.min(Math.max(index, 0), length - 1)

/** CLAMP per design §4 — reversible: flip to modulo wrap here + the boundary tests if UX testing disagrees. */
function stepSibling(graph: WorktreeGraph, currentId: WorktreeId, offset: number): WorktreeId {
  const siblings = siblingsOf(graph, currentId)
  const index = siblings.indexOf(currentId)
  if (index === -1) {
    return currentId
  }
  return siblings[clampIndex(index + offset, siblings.length)] ?? currentId
}

/** Never throws; `null` current or an unresolvable move is a no-op / falls back to `initialSelection`. */
export function moveSelection(
  graph: WorktreeGraph,
  currentId: WorktreeId | null,
  direction: NavDirection
): WorktreeId | null {
  if (currentId === null) {
    return initialSelection(graph)
  }
  switch (direction) {
    case 'parent':
      return parentOf(graph, currentId) ?? currentId
    case 'child':
      return childrenOf(graph, currentId)[0] ?? currentId
    case 'prev-sibling':
      return stepSibling(graph, currentId, -1)
    case 'next-sibling':
      return stepSibling(graph, currentId, 1)
  }
}

/** Direct parent of `id` among surviving nodes, found via their raw (unfiltered) `childIds`. */
function survivingParentOf(graph: WorktreeGraph, id: WorktreeId): WorktreeId | null {
  for (const candidate of graph.nodes.values()) {
    if (candidate.childIds.includes(id)) {
      return candidate.id
    }
  }
  return null
}

/**
 * Unchanged id when it still exists. A vanished id resolves to its nearest surviving
 * ancestor when the graph still references it (via a surviving node's raw childIds),
 * else falls back to `initialSelection` at minimum. Never throws.
 */
export function reconcileSelection(graph: WorktreeGraph, currentId: WorktreeId | null): WorktreeId | null {
  if (currentId !== null && graph.nodes.has(currentId)) {
    return currentId
  }
  const ancestorId = currentId !== null ? survivingParentOf(graph, currentId) : null
  return ancestorId ?? initialSelection(graph)
}
