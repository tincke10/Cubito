import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { isClickNotDrag, pickNodeId, screenToNdc } from './node-pick'
import type { PickRect } from './node-pick'
import { NODE_SURFACE_NAME } from './node-mesh'

const rect: PickRect = { left: 10, top: 20, width: 100, height: 50 }

describe('screenToNdc', () => {
  it('maps the rect centre to the origin and the corners to ±1', () => {
    expect(screenToNdc({ x: 60, y: 45 }, rect)).toEqual({ x: 0, y: 0 })
    expect(screenToNdc({ x: 10, y: 20 }, rect)).toEqual({ x: -1, y: 1 })
    expect(screenToNdc({ x: 110, y: 70 }, rect)).toEqual({ x: 1, y: -1 })
  })

  it('flips the y axis', () => {
    expect(screenToNdc({ x: 60, y: 20 }, rect).y).toBe(1)
    expect(screenToNdc({ x: 60, y: 70 }, rect).y).toBe(-1)
  })
})

/** Camera looking straight down (-y) at the origin, up=(0,0,-1) to avoid the lookAt
 *  gimbal case that fires when the view direction is parallel to the default up vector. */
const topDownCamera = (): THREE.PerspectiveCamera => {
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100)
  camera.position.set(0, 10, 0)
  camera.up.set(0, 0, -1)
  camera.lookAt(0, 0, 0)
  camera.updateMatrixWorld()
  return camera
}

/** A node group at ground (x,z): a surface cube (y 0→1), a glow sprite and a ground shadow —
 *  mirrors node-mesh.ts's real shape (C7) so picking must filter by NODE_SURFACE_NAME. */
const nodeGroup = (worktreeId: string, x: number, z: number, surfaceY = 0.5): THREE.Group => {
  const group = new THREE.Group()
  group.position.set(x, 0, z)
  group.userData.worktreeId = worktreeId

  const surface = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1))
  surface.name = NODE_SURFACE_NAME
  surface.position.set(0, surfaceY, 0)
  group.add(surface)

  const glow = new THREE.Sprite(new THREE.SpriteMaterial())
  glow.name = 'glow'
  glow.scale.setScalar(4)
  glow.position.set(0, surfaceY, 0)
  group.add(glow)

  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1))
  shadow.name = 'shadow'
  shadow.rotation.x = -Math.PI / 2
  shadow.scale.setScalar(3)
  group.add(shadow)

  group.updateMatrixWorld(true)
  return group
}

const ndcThrough = (camera: THREE.Camera, point: THREE.Vector3Tuple): { x: number; y: number } => {
  const projected = new THREE.Vector3(...point).project(camera)
  return { x: projected.x, y: projected.y }
}

describe('pickNodeId', () => {
  it('returns the worktreeId of the group under the ray', () => {
    const camera = topDownCamera()
    const group = nodeGroup('wt-a', 0, 0)

    expect(pickNodeId(camera, { x: 0, y: 0 }, [group])).toBe('wt-a')
  })

  it('ignores hits on the glow sprite and the ground shadow', () => {
    const camera = topDownCamera()
    const group = nodeGroup('wt-a', 0, 0)
    // Derived, not hardcoded: a point beside the 1×1×1 box but inside the 4-scale glow/
    // 3-scale shadow footprints — the ray must miss the box entirely (verified below).
    const ndc = ndcThrough(camera, [1, 0.5, 0])

    expect(pickNodeId(camera, ndc, [group])).toBeNull()
  })

  it('returns the nearest of two overlapping nodes', () => {
    const camera = topDownCamera()
    const near = nodeGroup('wt-near', 0, 0, 0.5)
    const far = nodeGroup('wt-far', 0, 0, -3)

    expect(pickNodeId(camera, { x: 0, y: 0 }, [far, near])).toBe('wt-near')
  })

  it('returns null for a ray that hits nothing', () => {
    const camera = topDownCamera()
    const group = nodeGroup('wt-a', 0, 0)

    expect(pickNodeId(camera, { x: 0.99, y: 0.99 }, [group])).toBeNull()
  })
})

describe('isClickNotDrag', () => {
  it('accepts movement within the slop on both axes and rejects it beyond', () => {
    expect(isClickNotDrag({ x: 0, y: 0 }, { x: 3, y: -3 }, 4)).toBe(true)
    expect(isClickNotDrag({ x: 0, y: 0 }, { x: 5, y: 0 }, 4)).toBe(false)
    expect(isClickNotDrag({ x: 0, y: 0 }, { x: 0, y: 5 }, 4)).toBe(false)
  })
})
