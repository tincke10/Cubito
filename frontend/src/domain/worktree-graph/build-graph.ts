import type { WorktreeEdge, WorktreeGraph, WorktreeId, WorktreeNode } from './types'

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
      parentId: raw.parentWorktreeId,
      childIds: [...raw.childWorktreeIds]
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
