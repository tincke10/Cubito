import { describe, expect, it } from 'vitest'
import { FIT_MIN_RADIUS, FIT_PADDING, FOCUS_RADIUS } from '../theme/scene-metrics'
import {
  easeInOutCubic,
  frameAll,
  frameIsland,
  frameLitter,
  frameNode,
  interpolateFraming,
  islandCenters,
  isWithinFraming,
  type Vec3
} from './camera-framing'
import { inertActivity } from '../../domain/worktree-graph/node-activity'
import type { WorktreeGraph, WorktreeId, WorktreeNode } from '../../domain/worktree-graph/types'

const v = (x: number, y: number, z: number): Vec3 => ({ x, y, z })
const distance = (a: Vec3, b: Vec3): number =>
  Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2)

describe('frameNode', () => {
  it('targets the given center at the fixed focus radius', () => {
    const center = v(3, 0.6, -4)
    const framing = frameNode(center)
    expect(framing.target).toBe(center)
    expect(framing.radius).toBe(FOCUS_RADIUS)
  })
})

describe('frameAll', () => {
  it('frames the origin at the minimum radius when given no centers', () => {
    const framing = frameAll([])
    expect(framing.target).toEqual({ x: 0, y: 0, z: 0 })
    expect(framing.radius).toBe(FIT_MIN_RADIUS)
    expect(Number.isFinite(framing.radius)).toBe(true)
    expect(Number.isNaN(framing.target.x)).toBe(false)
  })

  it('targets the single point, clamped to the minimum radius', () => {
    const p = v(5, 0, -2)
    const framing = frameAll([p])
    expect(framing.target).toEqual(p)
    expect(framing.radius).toBeGreaterThanOrEqual(FIT_MIN_RADIUS)
  })

  it('centers on the min/max midpoint and contains every point within the padded radius', () => {
    const points = [v(-10, 0, -2), v(10, 0, 2), v(0, 0, 8), v(-3, 0, -8)]
    const framing = frameAll(points)

    expect(framing.target).toEqual({
      x: (-10 + 10) / 2,
      y: (0 + 0) / 2,
      z: (-8 + 8) / 2
    })
    for (const p of points) {
      expect(distance(p, framing.target)).toBeLessThanOrEqual(framing.radius)
    }
    const maxDistance = Math.max(...points.map((p) => distance(p, framing.target)))
    expect(framing.radius).toBeCloseTo(Math.max(maxDistance + FIT_PADDING, FIT_MIN_RADIUS), 9)
  })
})

describe('easeInOutCubic', () => {
  it('hits the fixed endpoints and midpoint', () => {
    expect(easeInOutCubic(0)).toBe(0)
    expect(easeInOutCubic(1)).toBe(1)
    expect(easeInOutCubic(0.5)).toBeCloseTo(0.5, 9)
  })

  it('is monotonic non-decreasing across [0,1]', () => {
    let previous = -Infinity
    for (let t = 0; t <= 1; t += 0.05) {
      const value = easeInOutCubic(t)
      expect(value).toBeGreaterThanOrEqual(previous)
      previous = value
    }
  })
})

describe('interpolateFraming', () => {
  const from = { target: v(0, 0, 0), radius: 6 }
  const to = { target: v(10, 2, -4), radius: 12 }

  it('returns the start framing at t=0', () => {
    expect(interpolateFraming(from, to, 0)).toEqual(from)
  })

  it('returns the end framing at t=1', () => {
    expect(interpolateFraming(from, to, 1)).toEqual(to)
  })

  it('is strictly between componentwise at t=0.5', () => {
    const mid = interpolateFraming(from, to, 0.5)
    expect(mid.target.x).toBeGreaterThan(from.target.x)
    expect(mid.target.x).toBeLessThan(to.target.x)
    expect(mid.target.z).toBeLessThan(from.target.z)
    expect(mid.target.z).toBeGreaterThan(to.target.z)
    expect(mid.radius).toBeGreaterThan(from.radius)
    expect(mid.radius).toBeLessThan(to.radius)
  })
})

describe('isWithinFraming', () => {
  const framing = { target: v(0, 0, 0), radius: 5 }

  it('is true strictly inside the radius', () => {
    expect(isWithinFraming(v(3, 0, 0), framing, 0)).toBe(true)
  })

  it('is true exactly at the boundary plus margin', () => {
    expect(isWithinFraming(v(6, 0, 0), framing, 1)).toBe(true)
  })

  it('is false just beyond the boundary plus margin', () => {
    expect(isWithinFraming(v(6.01, 0, 0), framing, 1)).toBe(false)
  })
})

const node = (id: string, repoId: string): WorktreeNode => ({
  id,
  repoId,
  branch: id,
  path: `/tmp/${id}`,
  status: 'clean',
  isMain: false,
  kind: 'worktree',
  parentId: null,
  childIds: [],
  activity: inertActivity()
})

const twoIslandGraph = (): WorktreeGraph => ({
  nodes: new Map([
    ['a1', node('a1', 'repo-a')],
    ['a2', node('a2', 'repo-a')],
    ['b1', node('b1', 'repo-b')]
  ]),
  edges: [],
  rootIds: []
})

const CENTERS: Record<string, Vec3> = {
  a1: v(-5, 0, 0),
  a2: v(5, 0, 0),
  b1: v(0, 0, 20)
}
const lookup = (id: string): Vec3 | null => CENTERS[id] ?? null

describe('islandCenters', () => {
  it('collects only the centers of nodes in the given repo', () => {
    expect(islandCenters(twoIslandGraph(), 'repo-a', lookup)).toEqual([v(-5, 0, 0), v(5, 0, 0)])
    expect(islandCenters(twoIslandGraph(), 'repo-b', lookup)).toEqual([v(0, 0, 20)])
  })

  it('is empty for an unknown repoId', () => {
    expect(islandCenters(twoIslandGraph(), 'repo-none', lookup)).toEqual([])
  })

  it('skips a node whose center lookup returns null', () => {
    expect(islandCenters(twoIslandGraph(), 'repo-a', () => null)).toEqual([])
  })
})

describe('frameIsland', () => {
  it('frames exactly the given island, matching frameAll over its centers', () => {
    const framing = frameIsland(twoIslandGraph(), 'repo-a', lookup)
    expect(framing).toEqual(frameAll([v(-5, 0, 0), v(5, 0, 0)]))
  })

  it('is unaffected by other islands', () => {
    const framing = frameIsland(twoIslandGraph(), 'repo-b', lookup)
    expect(framing.target).toEqual(v(0, 0, 20))
  })
})

describe('frameLitter', () => {
  it('frames exactly the given member ids, matching frameAll over their resolved centers', () => {
    const memberIds: readonly WorktreeId[] = ['a1', 'a2']
    expect(frameLitter(memberIds, lookup)).toEqual(frameAll([v(-5, 0, 0), v(5, 0, 0)]))
  })

  it('skips a member whose center lookup returns null', () => {
    const memberIds: readonly WorktreeId[] = ['a1', 'unknown']
    expect(frameLitter(memberIds, lookup)).toEqual(frameAll([v(-5, 0, 0)]))
  })

  it('falls back to the origin at FIT_MIN_RADIUS when given no members', () => {
    const framing = frameLitter([], lookup)
    expect(framing).toEqual({ target: { x: 0, y: 0, z: 0 }, radius: FIT_MIN_RADIUS })
  })

  it('falls back to FIT_MIN_RADIUS when every member is unresolvable', () => {
    const framing = frameLitter(['unknown-1', 'unknown-2'], () => null)
    expect(framing.radius).toBe(FIT_MIN_RADIUS)
  })
})
