import { describe, expect, it } from 'vitest'
import { layoutByIsoLineage } from './iso-lineage-layout'
import { childrenOf } from '../../domain/worktree-graph/graph-traversal'
import { inertActivity } from '../../domain/worktree-graph/node-activity'
import type { WorktreeGraph, WorktreeId, WorktreeNode } from '../../domain/worktree-graph/types'

const node = (overrides: Partial<WorktreeNode> & Pick<WorktreeNode, 'id'>): WorktreeNode => ({
  repoId: 'repo',
  branch: `refs/heads/${overrides.id}`,
  path: `/path/${overrides.id}`,
  status: 'in-progress',
  isMain: false,
  kind: 'worktree',
  parentId: null,
  childIds: [],
  activity: inertActivity(),
  ...overrides
})

const graphOf = (nodes: readonly WorktreeNode[]): WorktreeGraph => ({
  nodes: new Map(nodes.map((n) => [n.id, n])),
  edges: [],
  rootIds: nodes.filter((n) => n.parentId === null).map((n) => n.id)
})

type Vec3 = { x: number; y: number; z: number }

/** Signed angular delta normalized to (−π, π], so a wraparound past ±π reads as the small step it is. */
const normalizeAngle = (angle: number): number => {
  let a = angle % (2 * Math.PI)
  if (a > Math.PI) a -= 2 * Math.PI
  if (a <= -Math.PI) a += 2 * Math.PI
  return a
}

/**
 * `childrenOf(graph, parentId)` is the single canonical sibling order (design §4) — both
 * `j`/`k` navigation and this layout must read it the same way. This asserts the layout
 * half of that contract: consecutive `childrenOf` entries sweep at a strictly increasing
 * angle around their parent's ground position, for any graph, forever.
 */
const expectStrictlyIncreasingSweep = (
  graph: WorktreeGraph,
  parentId: WorktreeId,
  positions: ReadonlyMap<WorktreeId, Vec3>
): void => {
  const parentPos = positions.get(parentId)
  expect(parentPos).toBeDefined()
  const kids = childrenOf(graph, parentId)
  const angles = kids.map((id) => {
    const p = positions.get(id)!
    return Math.atan2(p.z - parentPos!.z, p.x - parentPos!.x)
  })
  for (let i = 1; i < angles.length; i += 1) {
    expect(normalizeAngle(angles[i]! - angles[i - 1]!)).toBeGreaterThan(0)
  }
}

describe('layout ↔ traversal: cross-module sweep-angle order', () => {
  it('places childrenOf(graph, parentId)[i] at a strictly increasing sweep angle, for every parent with 2+ children', () => {
    const graph = graphOf([
      node({ id: 'root', isMain: true, kind: 'root', childIds: ['a', 'b', 'c', 'd'] }),
      node({ id: 'a', parentId: 'root', childIds: ['a1', 'a2', 'a3'] }),
      node({ id: 'b', parentId: 'root' }),
      node({ id: 'c', parentId: 'root', childIds: ['c1'] }),
      node({ id: 'd', parentId: 'root' }),
      node({ id: 'a1', parentId: 'a' }),
      node({ id: 'a2', parentId: 'a' }),
      node({ id: 'a3', parentId: 'a' }),
      node({ id: 'c1', parentId: 'c' })
    ])
    const positions = layoutByIsoLineage(graph)

    for (const parent of graph.nodes.values()) {
      if (childrenOf(graph, parent.id).length > 1) {
        expectStrictlyIncreasingSweep(graph, parent.id, positions)
      }
    }
  })

  it('holds for a root node across multiple disconnected root subtrees', () => {
    const graph = graphOf([
      node({ id: 'root-a', isMain: true, kind: 'root', childIds: ['a1', 'a2'] }),
      node({ id: 'root-b', kind: 'root' }),
      node({ id: 'root-c', kind: 'root' }),
      node({ id: 'a1', parentId: 'root-a' }),
      node({ id: 'a2', parentId: 'root-a' })
    ])
    const positions = layoutByIsoLineage(graph)
    expectStrictlyIncreasingSweep(graph, 'root-a', positions)
  })

  it('holds for a wide fan (24 siblings) where the widening rule kicks in', () => {
    const childIds = Array.from({ length: 24 }, (_, i) => `c${i}`)
    const graph = graphOf([
      node({ id: 'root', isMain: true, kind: 'root', childIds }),
      ...childIds.map((id) => node({ id, parentId: 'root' }))
    ])
    const positions = layoutByIsoLineage(graph)
    expectStrictlyIncreasingSweep(graph, 'root', positions)
  })
})
