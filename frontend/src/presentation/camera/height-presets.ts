import type { CameraFraming, Vec3 } from './camera-framing'
import type { CameraHeight, CameraPose } from './camera-pose'
import {
  CAMERA_HEIGHT_PRESETS,
  MAX_DOLLY_DISTANCE,
  MIN_DOLLY_DISTANCE
} from '../theme/scene-metrics'

const DEG_TO_RAD = Math.PI / 180

export type HeightPreset = { position: Vec3; lookAt: Vec3; fov: number; durationMs: number }

/** Typed re-binding: exhaustiveness without scene-metrics importing camera/ (design C4). */
const PRESETS: Record<CameraHeight, HeightPreset> = CAMERA_HEIGHT_PRESETS

export const heightDurationMs = (height: CameraHeight): number => PRESETS[height].durationMs

const toGround = (point: Vec3): Vec3 => ({ x: point.x, y: 0, z: point.z })
const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z })

/** foco uses `selection ?? anchor` (D6) — a working/waiting elevation bump must not move the
 *  camera, so the anchor's y is always forced to 0 before the preset offset is added. */
export const poseForHeight = (
  height: CameraHeight,
  anchor: Vec3,
  selection: Vec3 | null
): CameraPose => {
  const preset = PRESETS[height]
  const base = toGround(height === 'foco' ? (selection ?? anchor) : anchor)
  return { position: add(base, preset.position), lookAt: add(base, preset.lookAt), fov: preset.fov }
}

/** Viewing direction shared by every extent-derived pose (design D3): derived from the isla
 *  preset itself, so a retune of isla stays self-consistent. */
export const ISLA_VIEW_DIRECTION: Vec3 = (() => {
  const offset: Vec3 = {
    x: PRESETS.isla.position.x - PRESETS.isla.lookAt.x,
    y: PRESETS.isla.position.y - PRESETS.isla.lookAt.y,
    z: PRESETS.isla.position.z - PRESETS.isla.lookAt.z
  }
  const length = Math.sqrt(offset.x ** 2 + offset.y ** 2 + offset.z ** 2)
  return { x: offset.x / length, y: offset.y / length, z: offset.z / length }
})()

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value))

export const poseForExtent = (framing: CameraFraming, fov: number): CameraPose => {
  const distance = clamp(
    framing.radius / Math.sin((fov / 2) * DEG_TO_RAD),
    MIN_DOLLY_DISTANCE,
    MAX_DOLLY_DISTANCE
  )
  return {
    position: {
      x: framing.target.x + distance * ISLA_VIEW_DIRECTION.x,
      y: framing.target.y + distance * ISLA_VIEW_DIRECTION.y,
      z: framing.target.z + distance * ISLA_VIEW_DIRECTION.z
    },
    lookAt: framing.target,
    fov
  }
}
