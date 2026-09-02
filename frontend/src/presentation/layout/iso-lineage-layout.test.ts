import { describe, expect, it } from 'vitest'
import { layoutByIsoLineage } from './iso-lineage-layout'
import { inertActivity } from '../../domain/worktree-graph/node-activity'
import type { WorktreeGraph, WorktreeNode } from '../../domain/worktree-graph/types'
import { DEPTH_STEP, MIN_ANGULAR_SEPARATION } from '../theme/scene-metrics'

const node = (overrides: Partial<WorktreeNode> & Pick<WorktreeNode, 'id'>): WorktreeNode => ({
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

/** Builds a graph from nodes as given, without recomputing edges (layout reads nodes only). */
const graphOf = (nodes: readonly WorktreeNode[]): WorktreeGraph => ({
  nodes: new Map(nodes.map((n) => [n.id, n])),
  edges: [],
  rootIds: nodes.filter((n) => n.parentId === null).map((n) => n.id)
})

type Vec3 = { x: number; y: number; z: number }

const ORIGIN: Vec3 = { x: 0, y: 0, z: 0 }

const distance = (a: Vec3, b: Vec3): number => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)

describe('layoutByIsoLineage', () => {
  it('is deterministic for structurally-equal-but-distinct graphs', () => {
    const build = (): WorktreeGraph =>
      graphOf([
        node({ id: 'root', isMain: true, kind: 'root', childIds: ['a'] }),
        node({ id: 'a', parentId: 'root', childIds: ['b'] }),
        node({ id: 'b', parentId: 'a' })
      ])
    expect(layoutByIsoLineage(build())).toEqual(layoutByIsoLineage(build()))
  })

  it('assigns every node id exactly one position', () => {
    const graph = graphOf([
      node({ id: 'root', isMain: true, kind: 'root', childIds: ['a', 'b'] }),
      node({ id: 'a', parentId: 'root', childIds: ['c'] }),
      node({ id: 'b', parentId: 'root' }),
      node({ id: 'c', parentId: 'a' })
    ])
    const positions = layoutByIsoLineage(graph)
    expect(positions.size).toBe(4)
    for (const id of ['root', 'a', 'b', 'c']) {
      expect(positions.has(id)).toBe(true)
    }
  })

  it('never collapses distinct root subtrees onto the same ground position', () => {
    const graph = graphOf([
      node({ id: 'root-a', isMain: true, kind: 'root' }),
      node({ id: 'root-b' }),
      node({ id: 'root-c' })
    ])
    const positions = layoutByIsoLineage(graph)
    const values = [...positions.values()]
    for (let i = 0; i < values.length; i += 1) {
      for (let j = i + 1; j < values.length; j += 1) {
        expect(distance(values[i]!, values[j]!)).toBeGreaterThan(0)
      }
    }
  })

  it('never sets elevation — y is always 0', () => {
    const graph = graphOf([
      node({ id: 'root', isMain: true, kind: 'root', childIds: ['a'] }),
      node({ id: 'a', parentId: 'root', childIds: ['b'] }),
      node({ id: 'b', parentId: 'a' })
    ])
    for (const position of layoutByIsoLineage(graph).values()) {
      expect(position.y).toBe(0)
    }
  })

  it('places a lone root at the origin', () => {
    const graph = graphOf([node({ id: 'root', isMain: true, kind: 'root' })])
    expect(layoutByIsoLineage(graph).get('root')).toEqual(ORIGIN)
  })

  it('radiates outward: a lineage chain never folds a generation closer to the root than its parent', () => {
    const graph = graphOf([
      node({ id: 'root', isMain: true, kind: 'root', childIds: ['child'] }),
      node({ id: 'child', parentId: 'root', childIds: ['grandchild'] }),
      node({ id: 'grandchild', parentId: 'child' })
    ])
    const positions = layoutByIsoLineage(graph)
    const rootDist = distance(ORIGIN, positions.get('root')!)
    const childDist = distance(ORIGIN, positions.get('child')!)
    const grandchildDist = distance(ORIGIN, positions.get('grandchild')!)
    expect(childDist).toBeGreaterThan(rootDist)
    expect(grandchildDist).toBeGreaterThan(childDist)
  })

  it('widens the radius rather than crowding siblings when a wide fan would violate MIN_ANGULAR_SEPARATION', () => {
    const childIds = Array.from({ length: 40 }, (_, i) => `c${i}`)
    const graph = graphOf([
      node({ id: 'root', isMain: true, kind: 'root', childIds }),
      ...childIds.map((id) => node({ id, parentId: 'root' }))
    ])
    const positions = layoutByIsoLineage(graph)
    const childPositions = childIds.map((id) => positions.get(id)!)

    // Root sits at the origin, so distance-from-origin *is* the resolved radius.
    const resolvedRadius = distance(ORIGIN, childPositions[0]!)
    expect(resolvedRadius).toBeGreaterThan(DEPTH_STEP)

    for (let i = 0; i < childPositions.length - 1; i += 1) {
      expect(distance(childPositions[i]!, childPositions[i + 1]!)).toBeGreaterThanOrEqual(
        MIN_ANGULAR_SEPARATION - 0.05
      )
    }
  })
})
