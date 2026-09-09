import { FIT_MIN_RADIUS, FIT_PADDING, FOCUS_RADIUS } from '../theme/scene-metrics'
import type { WorktreeGraph, WorktreeId } from '../../domain/worktree-graph/types'

export type Vec3 = { x: number; y: number; z: number }
export type CameraFraming = { target: Vec3; radius: number }

const distance = (a: Vec3, b: Vec3): number =>
  Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2)

/** Camera-type-agnostic on purpose — the rig is the only file that knows it's orthographic. */
export const frameNode = (center: Vec3): CameraFraming => ({ target: center, radius: FOCUS_RADIUS })

/** Bounding sphere: min/max midpoint as center, max radial distance + padding as radius. */
export const frameAll = (centers: Iterable<Vec3>): CameraFraming => {
  const points = Array.from(centers)
  if (points.length === 0) return { target: { x: 0, y: 0, z: 0 }, radius: FIT_MIN_RADIUS }

  let minX = Infinity
  let minY = Infinity
  let minZ = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  let maxZ = -Infinity
  for (const p of points) {
    minX = Math.min(minX, p.x)
    maxX = Math.max(maxX, p.x)
    minY = Math.min(minY, p.y)
    maxY = Math.max(maxY, p.y)
    minZ = Math.min(minZ, p.z)
    maxZ = Math.max(maxZ, p.z)
  }
  const target: Vec3 = { x: (minX + maxX) / 2, y: (minY + maxY) / 2, z: (minZ + maxZ) / 2 }

  let maxDistance = 0
  for (const p of points) maxDistance = Math.max(maxDistance, distance(p, target))

  return { target, radius: Math.max(maxDistance + FIT_PADDING, FIT_MIN_RADIUS) }
}

/** Standard cubic ease-in-out — distinct from pulse-cycle's CSS bezier easing. */
export const easeInOutCubic = (t: number): number =>
  t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2

const lerp = (a: number, b: number, t: number): number => {
  if (t <= 0) return a
  if (t >= 1) return b
  return a + (b - a) * t
}

export const interpolateFraming = (
  from: CameraFraming,
  to: CameraFraming,
  t: number
): CameraFraming => ({
  target: {
    x: lerp(from.target.x, to.target.x, t),
    y: lerp(from.target.y, to.target.y, t),
    z: lerp(from.target.z, to.target.z, t)
  },
  radius: lerp(from.radius, to.radius, t)
})

export const isWithinFraming = (point: Vec3, framing: CameraFraming, margin: number): boolean =>
  distance(point, framing.target) <= framing.radius + margin

/** Centers of every node in `repoId`'s island, via an injected lookup (design Area 7) — shared by
 *  the keyboard-controller's Tab island-cycle and the ⌘P selector's activate. */
export const islandCenters = (
  graph: WorktreeGraph,
  repoId: string,
  nodeCenter: (id: WorktreeId) => Vec3 | null
): Vec3[] => {
  const centers: Vec3[] = []
  for (const node of graph.nodes.values()) {
    if (node.repoId !== repoId) continue
    const center = nodeCenter(node.id)
    if (center) centers.push(center)
  }
  return centers
}

/** Frames the camera on one repo's island — `frameAll` over just that island's node centers. */
export const frameIsland = (
  graph: WorktreeGraph,
  repoId: string,
  nodeCenter: (id: WorktreeId) => Vec3 | null
): CameraFraming => frameAll(islandCenters(graph, repoId, nodeCenter))

/** Frames the camera on a fan-out litter (parent + its batch) — `frameAll` over the resolved
 *  member centers; an empty/unresolvable set falls back to `frameAll`'s empty-input radius. */
export const frameLitter = (
  memberIds: readonly WorktreeId[],
  nodeCenter: (id: WorktreeId) => Vec3 | null
): CameraFraming => {
  const centers: Vec3[] = []
  for (const id of memberIds) {
    const center = nodeCenter(id)
    if (center) centers.push(center)
  }
  return frameAll(centers)
}

/** A litter's member count plus its resolved centers, as framed last time. */
export type LitterLayout = { count: number; centers: readonly Vec3[] }

/** Camera decision for a fan-out litter (Change item 2, corrected W11): reframes (same
 *  `frameLitter`/`frameAll` math) when a new child landed (count grew), when the graph's own
 *  layout moved the existing members (e.g. the post-batch `refetch()` swaps in the host's real
 *  worktree.list positions — a discrete store event, not a tween, so a missed one leaves a
 *  member off-screen), or on the very first framing (`previous === null`). Never on a shrink —
 *  a failed/removed member must not yank the camera in — and never for a single member: at
 *  submit the litter is just the parent, and zooming onto it alone reads as a jolt. */
export const frameLitterOnLayout = (
  previous: LitterLayout | null,
  next: LitterLayout
): CameraFraming | null => {
  if (next.count <= 1) return null
  if (previous === null) return frameAll(next.centers)
  if (next.count > previous.count) return frameAll(next.centers)
  if (next.count < previous.count) return null
  const moved =
    next.centers.length !== previous.centers.length ||
    next.centers.some((c, i) => {
      const p = previous.centers[i]!
      return c.x !== p.x || c.y !== p.y || c.z !== p.z
    })
  return moved ? frameAll(next.centers) : null
}
