import type { WorktreeGraph, WorktreeId } from '../../domain/worktree-graph/types'

export type Vec3 = { x: number; y: number; z: number }

export type LineageLayoutOptions = {
  /** Distance between a parent and its children ring. */
  radius: number
}

/**
 * Deterministic placeholder layout: BFS from the roots, children spread on a
 * ring around their parent, depth pushed along Z. Good enough to see a graph
 * breathe; replaced later by the force/packing layout the design will define.
 */
export function layoutByLineage(
  graph: WorktreeGraph,
  options: LineageLayoutOptions
): Map<WorktreeId, Vec3> {
  const positions = new Map<WorktreeId, Vec3>()
  const childrenOf = new Map<WorktreeId, WorktreeId[]>()
  for (const edge of graph.edges) {
    const bucket = childrenOf.get(edge.from) ?? []
    bucket.push(edge.to)
    childrenOf.set(edge.from, bucket)
  }

  const queue: WorktreeId[] = []
  graph.rootIds.forEach((rootId, index) => {
    // Extra roots ring around the first so disconnected trees stay visible.
    if (index === 0) {
      positions.set(rootId, { x: 0, y: 0, z: 0 })
    } else {
      const angle = (2 * Math.PI * (index - 1)) / Math.max(graph.rootIds.length - 1, 1)
      positions.set(rootId, {
        x: Math.cos(angle) * options.radius * 3,
        y: Math.sin(angle) * options.radius * 3,
        z: 0
      })
    }
    queue.push(rootId)
  })

  while (queue.length > 0) {
    const parentId = queue.shift()!
    const parentPos = positions.get(parentId)!
    const children = childrenOf.get(parentId) ?? []
    children.forEach((childId, index) => {
      if (positions.has(childId)) {
        return
      }
      const angle = (2 * Math.PI * index) / children.length
      const lateral = children.length === 1 ? 0 : options.radius * 0.6
      const depth = Math.sqrt(Math.max(options.radius ** 2 - lateral ** 2, 0))
      positions.set(childId, {
        x: parentPos.x + Math.cos(angle) * lateral,
        y: parentPos.y + Math.sin(angle) * lateral,
        z: parentPos.z - depth
      })
      queue.push(childId)
    })
  }

  return positions
}
