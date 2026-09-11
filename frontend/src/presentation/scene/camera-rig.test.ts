import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { createCameraRig } from './camera-rig'
import { easeInOutCubic } from '../camera/camera-framing'
import type { CameraPose } from '../camera/camera-pose'

// OrbitControls tolerates an undefined domElement (verified against three@0.180 in node) —
// it simply skips wiring pointer listeners, which is exactly the untested DOM boundary.
function setupRig(): { camera: THREE.PerspectiveCamera; controls: OrbitControls } {
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 400)
  const controls = new OrbitControls(camera, undefined)
  return { camera, controls }
}

const pose = (
  position: THREE.Vector3Tuple,
  lookAt: THREE.Vector3Tuple,
  fov: number
): CameraPose => ({
  position: { x: position[0], y: position[1], z: position[2] },
  lookAt: { x: lookAt[0], y: lookAt[1], z: lookAt[2] },
  fov
})

describe('createCameraRig', () => {
  it('apply() sets position, fov and refreshes the projection matrix', () => {
    const { camera, controls } = setupRig()
    const rig = createCameraRig(camera, controls)

    rig.apply(pose([1, 2, 3], [0, 0, 0], 50))

    expect(camera.position.x).toBeCloseTo(1, 9)
    expect(camera.position.y).toBeCloseTo(2, 9)
    expect(camera.position.z).toBeCloseTo(3, 9)
    expect(camera.fov).toBe(50)
    const reference = new THREE.PerspectiveCamera(50, camera.aspect, camera.near, camera.far)
    reference.updateProjectionMatrix()
    expect([...camera.projectionMatrix.elements]).toEqual([...reference.projectionMatrix.elements])
  })

  it('apply() sets controls.target and never calls camera.lookAt — orientation survives controls.update()', () => {
    const { camera, controls } = setupRig()
    const rig = createCameraRig(camera, controls)

    rig.apply(pose([0, 5, 10], [3, 0, -2], 40))
    controls.update()

    const direction = new THREE.Vector3()
    camera.getWorldDirection(direction)
    const expected = new THREE.Vector3(3, 0, -2).sub(new THREE.Vector3(0, 5, 10)).normalize()
    expect(direction.dot(expected)).toBeCloseTo(1, 5)
    expect(controls.target.x).toBeCloseTo(3, 9)
    expect(controls.target.y).toBeCloseTo(0, 9)
    expect(controls.target.z).toBeCloseTo(-2, 9)
  })

  it('setAspect() sets camera.aspect and refreshes the projection matrix', () => {
    const { camera, controls } = setupRig()
    const rig = createCameraRig(camera, controls)

    rig.setAspect(2)

    expect(camera.aspect).toBe(2)
    const reference = new THREE.PerspectiveCamera(camera.fov, 2, camera.near, camera.far)
    reference.updateProjectionMatrix()
    expect([...camera.projectionMatrix.elements]).toEqual([...reference.projectionMatrix.elements])
  })

  it('animateTo() + tick() interpolate position, lookAt and fov, eased with easeInOutCubic', () => {
    const { camera, controls } = setupRig()
    const rig = createCameraRig(camera, controls)
    const from = pose([0, 0, 0], [0, 0, 0], 30)
    const to = pose([10, 0, 0], [5, 0, 0], 50)
    rig.apply(from)

    rig.animateTo(to, 400)
    rig.tick(0) // establishes tween start
    expect(camera.position.x).toBeCloseTo(0, 9)

    rig.tick(0.2) // halfway through the 400ms/0.4s tween
    const eased = easeInOutCubic(0.5)
    expect(camera.position.x).toBeCloseTo(0 + (10 - 0) * eased, 6)
    expect(controls.target.x).toBeCloseTo(0 + (5 - 0) * eased, 6)
    expect(camera.fov).toBeCloseTo(30 + (50 - 30) * eased, 6)

    rig.tick(0.4) // elapsed >= durationMs(0.4s) -> exact target
    expect(camera.position.x).toBeCloseTo(10, 9)
    expect(controls.target.x).toBeCloseTo(5, 9)
    expect(camera.fov).toBeCloseTo(50, 9)

    rig.tick(10) // tween is done; further ticks must not move the camera again
    expect(camera.position.x).toBeCloseTo(10, 9)
  })

  it('the projection matrix changes mid-tween, not only at the end', () => {
    const { camera, controls } = setupRig()
    const rig = createCameraRig(camera, controls)
    const from = pose([0, 0, 0], [0, 0, 0], 30)
    const to = pose([10, 0, 0], [0, 0, 0], 60)
    rig.apply(from)
    rig.animateTo(to, 400)

    rig.tick(0)
    const atStart = [...camera.projectionMatrix.elements]
    rig.tick(0.2)
    const atMid = [...camera.projectionMatrix.elements]
    expect(atMid).not.toEqual(atStart)
    rig.tick(0.4)
    const atEnd = [...camera.projectionMatrix.elements]
    expect(atEnd).not.toEqual(atMid)
  })

  it('animateTo(pose, 0) snaps instantly', () => {
    const { camera, controls } = setupRig()
    const rig = createCameraRig(camera, controls)
    const to = pose([3, 0, 3], [0, 0, 0], 45)

    rig.animateTo(to, 0)

    expect(camera.position.x).toBeCloseTo(3, 9)
    expect(camera.fov).toBe(45)
  })

  it('a controls "start" event cancels an in-flight tween', () => {
    const { camera, controls } = setupRig()
    const rig = createCameraRig(camera, controls)
    const from = pose([0, 0, 0], [0, 0, 0], 30)
    const to = pose([10, 0, 0], [0, 0, 0], 50)
    rig.apply(from)
    rig.animateTo(to, 400)
    rig.tick(0)
    rig.tick(0.1)
    const xBeforeCancel = camera.position.x

    controls.dispatchEvent({ type: 'start' })
    rig.tick(0.4) // would have reached `to` if the tween were still active

    expect(camera.position.x).toBeCloseTo(xBeforeCancel, 9)
  })

  it('dispose() removes its drag-cancel listener from controls', () => {
    const { camera, controls } = setupRig()
    const rig = createCameraRig(camera, controls)
    const from = pose([0, 0, 0], [0, 0, 0], 30)
    const to = pose([10, 0, 0], [0, 0, 0], 50)
    rig.apply(from)
    rig.animateTo(to, 400)
    rig.tick(0)

    rig.dispose()
    controls.dispatchEvent({ type: 'start' }) // must no longer cancel the tween
    rig.tick(0.4)

    expect(camera.position.x).toBeCloseTo(10, 9)
  })

  it('currentPose() round-trips a hand-orbited camera', () => {
    const { camera, controls } = setupRig()
    const rig = createCameraRig(camera, controls)

    camera.position.set(7, 8, 9)
    controls.target.set(1, 2, 3)
    camera.fov = 55
    controls.update()

    const result = rig.currentPose()
    expect(result.position.x).toBeCloseTo(7, 6)
    expect(result.position.y).toBeCloseTo(8, 6)
    expect(result.position.z).toBeCloseTo(9, 6)
    expect(result.lookAt.x).toBeCloseTo(1, 6)
    expect(result.lookAt.y).toBeCloseTo(2, 6)
    expect(result.lookAt.z).toBeCloseTo(3, 6)
    expect(result.fov).toBe(55)
  })

  it('isPointInView() is true for the lookAt target and false for a point behind the camera', () => {
    const { camera, controls } = setupRig()
    const rig = createCameraRig(camera, controls)
    rig.apply(pose([0, 0, 10], [0, 0, 0], 50))

    expect(rig.isPointInView({ x: 0, y: 0, z: 0 }, 0)).toBe(true)
    expect(rig.isPointInView({ x: 0, y: 0, z: 20 }, 0)).toBe(false)
  })

  it('isPointInView() is false well outside the frustum and true just outside it within margin', () => {
    const { camera, controls } = setupRig()
    const rig = createCameraRig(camera, controls)
    const distance = 10
    const fov = 50
    rig.apply(pose([0, 0, distance], [0, 0, 0], fov))
    const halfHeight = distance * Math.tan(((fov / 2) * Math.PI) / 180)

    expect(rig.isPointInView({ x: 1000, y: 0, z: 0 }, 0)).toBe(false)
    const justOutside = { x: 0, y: halfHeight + 1, z: 0 }
    expect(rig.isPointInView(justOutside, 0)).toBe(false)
    expect(rig.isPointInView(justOutside, 2)).toBe(true)
  })
})
