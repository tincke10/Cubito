import type { WorktreeEdge, WorktreeGraph, WorktreeId, WorktreeNode } from './types'

type MutablePartition = {
  nodes: Map<WorktreeId, WorktreeNode>
  edges: WorktreeEdge[]
  rootIds: WorktreeId[]
}

/** Pure split of a graph into one sub-graph per repoId — the galaxy layout's per-island input. */
export function partitionGraphByRepo(graph: WorktreeGraph): Map<string, WorktreeGraph> {
  const buckets = new Map<string, MutablePartition>()
  const bucketFor = (repoId: string): MutablePartition => {
    let bucket = buckets.get(repoId)
    if (!bucket) {
      bucket = { nodes: new Map(), edges: [], rootIds: [] }
      buckets.set(repoId, bucket)
    }
    return bucket
  }

  for (const node of graph.nodes.values()) {
    bucketFor(node.repoId).nodes.set(node.id, node)
  }
  for (const edge of graph.edges) {
    const fromNode = graph.nodes.get(edge.from)
    if (fromNode && bucketFor(fromNode.repoId).nodes.has(edge.to)) {
      bucketFor(fromNode.repoId).edges.push(edge)
    }
  }
  for (const rootId of graph.rootIds) {
    const node = graph.nodes.get(rootId)
    if (node) bucketFor(node.repoId).rootIds.push(rootId)
  }

  return new Map(
    [...buckets].map(([repoId, bucket]) => [
      repoId,
      { nodes: bucket.nodes, edges: bucket.edges, rootIds: bucket.rootIds }
    ])
  )
}
