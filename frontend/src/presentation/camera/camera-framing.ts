import { FIT_MIN_RADIUS, FIT_PADDING, FOCUS_RADIUS } from '../theme/scene-metrics'

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

export const interpolateFraming = (from: CameraFraming, to: CameraFraming, t: number): CameraFraming => ({
  target: {
    x: lerp(from.target.x, to.target.x, t),
    y: lerp(from.target.y, to.target.y, t),
    z: lerp(from.target.z, to.target.z, t)
  },
  radius: lerp(from.radius, to.radius, t)
})

export const isWithinFraming = (point: Vec3, framing: CameraFraming, margin: number): boolean =>
  distance(point, framing.target) <= framing.radius + margin
