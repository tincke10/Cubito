import { describe, expect, it } from 'vitest'
import {
  ISLA_VIEW_DIRECTION,
  heightDurationMs,
  poseForExtent,
  poseForHeight
} from './height-presets'
import { CAMERA_HEIGHTS } from './camera-pose'
import {
  MAX_DOLLY_DISTANCE,
  MIN_DOLLY_DISTANCE,
  MAX_POLAR_DEG,
  MIN_POLAR_DEG
} from '../theme/scene-metrics'
import type { Vec3 } from './camera-framing'

const ORIGIN: Vec3 = { x: 0, y: 0, z: 0 }

const vecLength = (v: Vec3): number => Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z)
const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z })

describe('poseForHeight', () => {
  it('offsets position and lookAt from the anchor ground point for general', () => {
    const anchor: Vec3 = { x: 10, y: 7, z: -4 }
    const pose = poseForHeight('general', anchor, null)
    expect(pose.position).toEqual({ x: 10 + 19, y: 58, z: -4 + 82 })
    expect(pose.lookAt).toEqual({ x: 10, y: 0, z: -4 })
    expect(pose.fov).toBe(40)
  })

  it('anchors isla and comparar on the island ground point', () => {
    const anchor: Vec3 = { x: 10, y: 7, z: -4 }
    const isla = poseForHeight('isla', anchor, null)
    expect(isla.position).toEqual({ x: 10 + 12, y: 15, z: -4 + 24 })
    expect(isla.lookAt).toEqual({ x: 10 - 0.5, y: 0, z: -4 - 1.5 })

    const comparar = poseForHeight('comparar', anchor, null)
    expect(comparar.position).toEqual({ x: 10, y: 5.5, z: -4 + 15 })
    expect(comparar.lookAt).toEqual({ x: 10, y: 0.8, z: -4 - 8 })
  })

  it('anchors foco on the selection with its lookAt lifted to the foco eye height', () => {
    const anchor: Vec3 = { x: 10, y: 7, z: -4 }
    const selection: Vec3 = { x: -2, y: 3, z: 6 }
    const pose = poseForHeight('foco', anchor, selection)
    expect(pose.position).toEqual({ x: -2 + 3.4, y: 2.6, z: 6 + 4.6 })
    expect(pose.lookAt).toEqual({ x: -2, y: 0.7, z: 6 })
  })

  it('falls back to the anchor when nothing is selected for foco', () => {
    const anchor: Vec3 = { x: 1, y: 0, z: 2 }
    const pose = poseForHeight('foco', anchor, null)
    expect(pose.position).toEqual({ x: 1 + 3.4, y: 2.6, z: 2 + 4.6 })
    expect(pose.lookAt).toEqual({ x: 1, y: 0.7, z: 2 })
  })

  it('ignores the anchor y, using only x and z', () => {
    const flat = poseForHeight('general', { x: 5, y: 0, z: 5 }, null)
    const elevated = poseForHeight('general', { x: 5, y: 99, z: 5 }, null)
    expect(elevated).toEqual(flat)
  })
})

describe('heightDurationMs', () => {
  it('is 600 for general and comparar, 420 for isla and foco', () => {
    expect(heightDurationMs('general')).toBe(600)
    expect(heightDurationMs('comparar')).toBe(600)
    expect(heightDurationMs('isla')).toBe(420)
    expect(heightDurationMs('foco')).toBe(420)
  })
})

describe('OrbitControls bounds ratchet', () => {
  it('every preset sits inside the OrbitControls polar and dolly bounds', () => {
    for (const height of CAMERA_HEIGHTS) {
      const selection = height === 'foco' ? ORIGIN : null
      const pose = poseForHeight(height, ORIGIN, selection)
      const offset = sub(pose.position, pose.lookAt)
      const distance = vecLength(offset)
      const polarDeg = (Math.acos(offset.y / distance) * 180) / Math.PI

      expect(distance).toBeGreaterThanOrEqual(MIN_DOLLY_DISTANCE)
      expect(distance).toBeLessThanOrEqual(MAX_DOLLY_DISTANCE)
      expect(polarDeg).toBeGreaterThanOrEqual(MIN_POLAR_DEG)
      expect(polarDeg).toBeLessThanOrEqual(MAX_POLAR_DEG)
    }
  })
})

describe('poseForExtent', () => {
  it('places the camera at radius / sin(fov/2) from the framing target', () => {
    const framing = { target: { x: 1, y: 2, z: 3 }, radius: 10 }
    const fov = 40
    const pose = poseForExtent(framing, fov)
    const expectedDistance = 10 / Math.sin(((fov / 2) * Math.PI) / 180)
    expect(vecLength(sub(pose.position, pose.lookAt))).toBeCloseTo(expectedDistance, 6)
  })

  it('uses the isla viewing direction, derived from the isla preset itself', () => {
    const framing = { target: { x: 0, y: 0, z: 0 }, radius: 10 }
    const pose = poseForExtent(framing, 40)
    const offset = sub(pose.position, pose.lookAt)
    const length = vecLength(offset)
    const direction = { x: offset.x / length, y: offset.y / length, z: offset.z / length }
    expect(direction.x).toBeCloseTo(ISLA_VIEW_DIRECTION.x, 9)
    expect(direction.y).toBeCloseTo(ISLA_VIEW_DIRECTION.y, 9)
    expect(direction.z).toBeCloseTo(ISLA_VIEW_DIRECTION.z, 9)
  })

  it('clamps the distance into [MIN_DOLLY_DISTANCE, MAX_DOLLY_DISTANCE]', () => {
    const target = { x: 0, y: 0, z: 0 }
    const farTooBig = poseForExtent({ target, radius: 10000 }, 40)
    expect(vecLength(sub(farTooBig.position, target))).toBeCloseTo(MAX_DOLLY_DISTANCE, 6)

    const tooSmall = poseForExtent({ target, radius: 0.001 }, 40)
    expect(vecLength(sub(tooSmall.position, target))).toBeCloseTo(MIN_DOLLY_DISTANCE, 6)
  })

  it('keeps lookAt at the framing target and fov as given', () => {
    const framing = { target: { x: 4, y: -1, z: 2 }, radius: 8 }
    const pose = poseForExtent(framing, 36)
    expect(pose.lookAt).toEqual(framing.target)
    expect(pose.fov).toBe(36)
  })
})
