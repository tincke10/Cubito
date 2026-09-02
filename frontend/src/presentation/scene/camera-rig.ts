import * as THREE from 'three'
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { easeInOutCubic, interpolateFraming } from '../camera/camera-framing'
import type { CameraFraming } from '../camera/camera-framing'
import {
  CAMERA_DISTANCE,
  ISO_AZIMUTH_DEG,
  ISO_ELEVATION_DEG,
  MS_PER_SECOND,
  REFERENCE_HALF_HEIGHT
} from '../theme/scene-metrics'

export type CameraRig = {
  apply(framing: CameraFraming): void
  animateTo(framing: CameraFraming, durationMs: number): void
  tick(elapsedSeconds: number): void
  setAspect(aspect: number): void
  dispose(): void
}

type Tween = {
  from: CameraFraming
  to: CameraFraming
  startSeconds: number | null
  durationSeconds: number
}

const azimuthRad = THREE.MathUtils.degToRad(ISO_AZIMUTH_DEG)
const elevationRad = THREE.MathUtils.degToRad(ISO_ELEVATION_DEG)

/** Unit vector from the framing target to the camera, per design §9. */
const CAMERA_DIRECTION = new THREE.Vector3(
  Math.sin(azimuthRad) * Math.cos(elevationRad),
  Math.sin(elevationRad),
  Math.cos(azimuthRad) * Math.cos(elevationRad)
)

/**
 * Orthographic iso rig coexisting with OrbitControls: framing drives `zoom`
 * (never the frustum, which OrbitControls' own dolly also mutates), and the
 * only `setAnimationLoop` in the app lives in create-scene — this owns no
 * loop, it just applies whatever `tick` is fed.
 */
export function createCameraRig(camera: THREE.OrthographicCamera, controls: OrbitControls): CameraRig {
  let tween: Tween | null = null

  const cancelTween = (): void => {
    tween = null
  }
  controls.addEventListener('start', cancelTween)

  camera.top = REFERENCE_HALF_HEIGHT
  camera.bottom = -REFERENCE_HALF_HEIGHT

  const applyFraming = (framing: CameraFraming): void => {
    camera.zoom = REFERENCE_HALF_HEIGHT / framing.radius
    camera.position.set(
      framing.target.x + CAMERA_DISTANCE * CAMERA_DIRECTION.x,
      framing.target.y + CAMERA_DISTANCE * CAMERA_DIRECTION.y,
      framing.target.z + CAMERA_DISTANCE * CAMERA_DIRECTION.z
    )
    controls.target.set(framing.target.x, framing.target.y, framing.target.z)
    camera.lookAt(controls.target)
    camera.updateProjectionMatrix()
  }

  const currentFraming = (): CameraFraming => ({
    target: { x: controls.target.x, y: controls.target.y, z: controls.target.z },
    radius: REFERENCE_HALF_HEIGHT / camera.zoom
  })

  return {
    apply(framing) {
      tween = null
      applyFraming(framing)
    },
    animateTo(framing, durationMs) {
      if (durationMs <= 0) {
        tween = null
        applyFraming(framing)
        return
      }
      tween = {
        from: currentFraming(),
        to: framing,
        startSeconds: null,
        durationSeconds: durationMs / MS_PER_SECOND
      }
    },
    tick(elapsedSeconds) {
      if (!tween) {
        return
      }
      if (tween.startSeconds === null) {
        tween.startSeconds = elapsedSeconds
      }
      const t =
        tween.durationSeconds <= 0
          ? 1
          : Math.min(1, (elapsedSeconds - tween.startSeconds) / tween.durationSeconds)
      applyFraming(interpolateFraming(tween.from, tween.to, easeInOutCubic(t)))
      if (t >= 1) {
        tween = null
      }
    },
    setAspect(aspect) {
      camera.left = -REFERENCE_HALF_HEIGHT * aspect
      camera.right = REFERENCE_HALF_HEIGHT * aspect
      camera.updateProjectionMatrix()
    },
    dispose() {
      controls.removeEventListener('start', cancelTween)
    }
  }
}
