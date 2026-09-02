import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { createCameraRig } from './camera-rig'
import { easeInOutCubic } from '../camera/camera-framing'
import { CAMERA_DISTANCE, REFERENCE_HALF_HEIGHT } from '../theme/scene-metrics'
import type { CameraFraming } from '../camera/camera-framing'

// OrbitControls tolerates an undefined domElement (verified against three@0.180 in node) —
// it simply skips wiring pointer listeners, which is exactly the untested DOM boundary.
function setupRig(): { camera: THREE.OrthographicCamera; controls: OrbitControls } {
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 2000)
  const controls = new OrbitControls(camera, undefined)
  return { camera, controls }
}

const EXPECTED_DIRECTION = { x: 0.6123724356957946, y: 0.5, z: 0.6123724356957946 }

describe('createCameraRig', () => {
  it('apply() sets zoom from REFERENCE_HALF_HEIGHT/radius instantly', () => {
    const { camera, controls } = setupRig()
    const rig = createCameraRig(camera, controls)
    const framing: CameraFraming = { target: { x: 0, y: 0, z: 0 }, radius: 5 }

    rig.apply(framing)

    expect(camera.zoom).toBeCloseTo(REFERENCE_HALF_HEIGHT / 5, 9)
  })

  it('apply() derives camera.position from target + CAMERA_DISTANCE*direction', () => {
    const { camera, controls } = setupRig()
    const rig = createCameraRig(camera, controls)
    const target = { x: 2, y: 1, z: -3 }
    rig.apply({ target, radius: 8 })

    expect(camera.position.x).toBeCloseTo(target.x + CAMERA_DISTANCE * EXPECTED_DIRECTION.x, 6)
    expect(camera.position.y).toBeCloseTo(target.y + CAMERA_DISTANCE * EXPECTED_DIRECTION.y, 6)
    expect(camera.position.z).toBeCloseTo(target.z + CAMERA_DISTANCE * EXPECTED_DIRECTION.z, 6)
  })

  it('apply() keeps controls.target in sync with the framing target', () => {
    const { camera, controls } = setupRig()
    const rig = createCameraRig(camera, controls)
    const target = { x: 4, y: 0, z: 4 }
    rig.apply({ target, radius: 6 })

    expect(controls.target.x).toBeCloseTo(target.x, 9)
    expect(controls.target.y).toBeCloseTo(target.y, 9)
    expect(controls.target.z).toBeCloseTo(target.z, 9)
  })

  it('setAspect() updates left/right only, leaving top/bottom at ±REFERENCE_HALF_HEIGHT', () => {
    const { camera, controls } = setupRig()
    const rig = createCameraRig(camera, controls)

    rig.setAspect(2)

    expect(camera.left).toBeCloseTo(-REFERENCE_HALF_HEIGHT * 2, 9)
    expect(camera.right).toBeCloseTo(REFERENCE_HALF_HEIGHT * 2, 9)
    expect(camera.top).toBeCloseTo(REFERENCE_HALF_HEIGHT, 9)
    expect(camera.bottom).toBeCloseTo(-REFERENCE_HALF_HEIGHT, 9)
  })

  it('animateTo() + tick() interpolate zoom/position and reach the exact target at elapsed>=durationMs', () => {
    const { camera, controls } = setupRig()
    const rig = createCameraRig(camera, controls)
    const from: CameraFraming = { target: { x: 0, y: 0, z: 0 }, radius: 10 }
    const to: CameraFraming = { target: { x: 10, y: 0, z: 0 }, radius: 5 }
    rig.apply(from)

    rig.animateTo(to, 400)
    rig.tick(0) // establishes tween start
    const zoomAtStart = camera.zoom
    expect(zoomAtStart).toBeCloseTo(REFERENCE_HALF_HEIGHT / from.radius, 9)

    rig.tick(0.2) // halfway through the 400ms/0.4s tween
    const midZoom = camera.zoom
    const midTargetX = controls.target.x
    expect(midZoom).toBeGreaterThan(REFERENCE_HALF_HEIGHT / from.radius)
    expect(midZoom).toBeLessThan(REFERENCE_HALF_HEIGHT / to.radius)
    expect(midTargetX).toBeGreaterThan(from.target.x)
    expect(midTargetX).toBeLessThan(to.target.x)
    const expectedEasedMidX = from.target.x + (to.target.x - from.target.x) * easeInOutCubic(0.5)
    expect(midTargetX).toBeCloseTo(expectedEasedMidX, 6)

    rig.tick(0.4) // elapsed >= durationMs(0.4s) -> exact target
    expect(camera.zoom).toBeCloseTo(REFERENCE_HALF_HEIGHT / to.radius, 9)
    expect(camera.position.x).toBeCloseTo(to.target.x + CAMERA_DISTANCE * EXPECTED_DIRECTION.x, 6)

    rig.tick(10) // tween is done; further ticks must not move the camera again
    expect(camera.zoom).toBeCloseTo(REFERENCE_HALF_HEIGHT / to.radius, 9)
  })

  it('animateTo() with duration 0 snaps instantly, no intermediate frames needed', () => {
    const { camera, controls } = setupRig()
    const rig = createCameraRig(camera, controls)
    const to: CameraFraming = { target: { x: 3, y: 0, z: 3 }, radius: 4 }

    rig.animateTo(to, 0)

    expect(camera.zoom).toBeCloseTo(REFERENCE_HALF_HEIGHT / to.radius, 9)
    expect(camera.position.x).toBeCloseTo(to.target.x + CAMERA_DISTANCE * EXPECTED_DIRECTION.x, 6)
  })

  it('a user drag (controls "start" event) cancels an in-flight tween', () => {
    const { camera, controls } = setupRig()
    const rig = createCameraRig(camera, controls)
    const from: CameraFraming = { target: { x: 0, y: 0, z: 0 }, radius: 10 }
    const to: CameraFraming = { target: { x: 10, y: 0, z: 0 }, radius: 5 }
    rig.apply(from)
    rig.animateTo(to, 400)
    rig.tick(0)
    rig.tick(0.1)
    const zoomBeforeCancel = camera.zoom

    controls.dispatchEvent({ type: 'start' })
    rig.tick(0.4) // would have reached `to` if the tween were still active

    expect(camera.zoom).toBeCloseTo(zoomBeforeCancel, 9)
  })

  it('dispose() removes its drag-cancel listener from controls', () => {
    const { camera, controls } = setupRig()
    const rig = createCameraRig(camera, controls)
    const from: CameraFraming = { target: { x: 0, y: 0, z: 0 }, radius: 10 }
    const to: CameraFraming = { target: { x: 10, y: 0, z: 0 }, radius: 5 }
    rig.apply(from)
    rig.animateTo(to, 400)
    rig.tick(0)

    rig.dispose()
    controls.dispatchEvent({ type: 'start' }) // must no longer cancel the tween
    rig.tick(0.4)

    expect(camera.zoom).toBeCloseTo(REFERENCE_HALF_HEIGHT / to.radius, 9)
  })
})
