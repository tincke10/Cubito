import { describe, expect, it } from 'vitest'
import { galaxyLayout } from './galaxy-layout'
import { layoutByIsoLineage } from './iso-lineage-layout'
import { inertActivity } from '../../domain/worktree-graph/node-activity'
import type { WorktreeGraph, WorktreeNode } from '../../domain/worktree-graph/types'
import { emptyWorktreeGraph } from '../../domain/worktree-graph/types'
import { GALAXY_ISLAND_GAP } from '../theme/scene-metrics'

const node = (
  overrides: Partial<WorktreeNode> & Pick<WorktreeNode, 'id' | 'repoId'>
): WorktreeNode => ({
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

/** Single-root repo with `childCount` direct children, for a controllable island bounding radius. */
const repoIsland = (repoId: string, childCount: number): WorktreeNode[] => {
  const rootId = `${repoId}::root`
  const childIds = Array.from({ length: childCount }, (_, i) => `${repoId}::c${i}`)
  return [
    node({ id: rootId, repoId, isMain: true, kind: 'root', childIds }),
    ...childIds.map((id) => node({ id, repoId, parentId: rootId }))
  ]
}

const distance = (a: { x: number; z: number }, b: { x: number; z: number }): number =>
  Math.hypot(a.x - b.x, a.z - b.z)

describe('galaxyLayout', () => {
  it('returns an empty map for an empty graph', () => {
    expect(galaxyLayout(emptyWorktreeGraph()).size).toBe(0)
  })

  it('matches layoutByIsoLineage byte-for-byte when every node shares one repoId', () => {
    const graph = graphOf(repoIsland('solo', 3))
    expect(galaxyLayout(graph)).toEqual(layoutByIsoLineage(graph))
  })

  it('places every node id exactly once, across multiple islands', () => {
    const graph = graphOf([...repoIsland('a', 2), ...repoIsland('b', 5), ...repoIsland('c', 1)])
    const positions = galaxyLayout(graph)
    expect(positions.size).toBe(graph.nodes.size)
    for (const id of graph.nodes.keys()) expect(positions.has(id)).toBe(true)
  })

  it('never overlaps island bounding circles, larger islands included', () => {
    const graph = graphOf([...repoIsland('a', 2), ...repoIsland('b', 20), ...repoIsland('c', 1)])
    const positions = galaxyLayout(graph)

    const islandOf = (repoId: string): { center: { x: number; z: number }; radius: number } => {
      const ids = [...graph.nodes.values()].filter((n) => n.repoId === repoId).map((n) => n.id)
      const center = positions.get(`${repoId}::root`)!
      const radius = Math.max(...ids.map((id) => distance(positions.get(id)!, center)))
      return { center, radius }
    }

    const islands = ['a', 'b', 'c'].map(islandOf)
    for (let i = 0; i < islands.length; i += 1) {
      for (let j = i + 1; j < islands.length; j += 1) {
        const gap =
          distance(islands[i]!.center, islands[j]!.center) - islands[i]!.radius - islands[j]!.radius
        expect(gap).toBeGreaterThanOrEqual(GALAXY_ISLAND_GAP - 1e-9)
      }
    }
  })

  it('is deterministic across structurally-equal-but-distinct graphs', () => {
    const build = (): WorktreeGraph => graphOf([...repoIsland('a', 2), ...repoIsland('b', 3)])
    expect(galaxyLayout(build())).toEqual(galaxyLayout(build()))
  })

  it('orders islands by repoOrder first, then lexicographically for the rest', () => {
    const graph = graphOf([...repoIsland('a', 1), ...repoIsland('b', 1), ...repoIsland('c', 1)])
    const withOrder = galaxyLayout(graph, { repoOrder: ['c', 'a'] })
    const lexicographic = galaxyLayout(graph)

    // repoOrder=['c','a'] puts 'c' first (index 0) instead of the lexicographic 'a' — the root
    // positions for 'c' and 'a' swap places relative to the default ordering.
    expect(withOrder.get('c::root')).toEqual(lexicographic.get('a::root'))
    expect(withOrder.get('a::root')).toEqual(lexicographic.get('b::root'))
    expect(withOrder.get('b::root')).toEqual(lexicographic.get('c::root'))
  })
})
