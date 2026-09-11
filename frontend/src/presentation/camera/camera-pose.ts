import type { Vec3 } from './camera-framing'

export type CameraHeight = 'general' | 'isla' | 'foco' | 'comparar'
export const CAMERA_HEIGHTS = [
  'general',
  'isla',
  'foco',
  'comparar'
] as const satisfies readonly CameraHeight[]
export const DEFAULT_CAMERA_HEIGHT: CameraHeight = 'isla'

export type CameraPose = { position: Vec3; lookAt: Vec3; fov: number }

const clamp01 = (t: number): number => (t < 0 ? 0 : t > 1 ? 1 : t)
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t
const lerpVec3 = (a: Vec3, b: Vec3, t: number): Vec3 => ({
  x: lerp(a.x, b.x, t),
  y: lerp(a.y, b.y, t),
  z: lerp(a.z, b.z, t)
})

/** No easing here — the rig feeds the eased t in. Mirrors camera-framing.ts's local lerp. */
export const interpolatePose = (from: CameraPose, to: CameraPose, t: number): CameraPose => {
  const clamped = clamp01(t)
  return {
    position: lerpVec3(from.position, to.position, clamped),
    lookAt: lerpVec3(from.lookAt, to.lookAt, clamped),
    fov: lerp(from.fov, to.fov, clamped)
  }
}

/** Pure translation: moves lookAt over `ground` (x/z), keeping eye height, offset and fov. */
export const panPoseTo = (pose: CameraPose, ground: Vec3): CameraPose => {
  const dx = ground.x - pose.lookAt.x
  const dz = ground.z - pose.lookAt.z
  return {
    position: { x: pose.position.x + dx, y: pose.position.y, z: pose.position.z + dz },
    lookAt: { x: ground.x, y: pose.lookAt.y, z: ground.z },
    fov: pose.fov
  }
}
