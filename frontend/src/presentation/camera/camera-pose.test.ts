import { describe, expect, it } from 'vitest'
import { CAMERA_HEIGHTS, interpolatePose, panPoseTo, type CameraPose } from './camera-pose'

const pose = (
  position: [number, number, number],
  lookAt: [number, number, number],
  fov: number
): CameraPose => ({
  position: { x: position[0], y: position[1], z: position[2] },
  lookAt: { x: lookAt[0], y: lookAt[1], z: lookAt[2] },
  fov
})

describe('interpolatePose', () => {
  const from = pose([0, 0, 0], [1, 1, 1], 30)
  const to = pose([10, 20, -10], [5, 5, 5], 40)

  it('returns from at t=0 and to at t=1, component-wise including fov', () => {
    expect(interpolatePose(from, to, 0)).toEqual(from)
    expect(interpolatePose(from, to, 1)).toEqual(to)
  })

  it('lerps position, lookAt and fov independently at t=0.5', () => {
    const mid = interpolatePose(from, to, 0.5)
    expect(mid.position).toEqual({ x: 5, y: 10, z: -5 })
    expect(mid.lookAt).toEqual({ x: 3, y: 3, z: 3 })
    expect(mid.fov).toBe(35)
  })

  it('clamps t below 0 and above 1', () => {
    expect(interpolatePose(from, to, -5)).toEqual(from)
    expect(interpolatePose(from, to, 5)).toEqual(to)
  })
})

describe('panPoseTo', () => {
  it('moves lookAt over the ground point, keeping eye height, offset and fov', () => {
    const original = pose([3, 5, -2], [0, 0.7, 0], 34)
    const ground = { x: 12, y: 0, z: -8 }

    const panned = panPoseTo(original, ground)

    expect(panned.lookAt).toEqual({ x: 12, y: 0.7, z: -8 })
    expect(panned.position.y).toBe(original.position.y)
    expect(panned.fov).toBe(original.fov)
    const originalOffset = {
      x: original.position.x - original.lookAt.x,
      y: original.position.y - original.lookAt.y,
      z: original.position.z - original.lookAt.z
    }
    const pannedOffset = {
      x: panned.position.x - panned.lookAt.x,
      y: panned.position.y - panned.lookAt.y,
      z: panned.position.z - panned.lookAt.z
    }
    expect(pannedOffset).toEqual(originalOffset)
  })
})

describe('CAMERA_HEIGHTS', () => {
  it('lists every CameraHeight exactly once', () => {
    expect(CAMERA_HEIGHTS).toEqual(['general', 'isla', 'foco', 'comparar'])
    expect(new Set(CAMERA_HEIGHTS).size).toBe(CAMERA_HEIGHTS.length)
  })
})
