import * as THREE from 'three'
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { easeInOutCubic } from '../camera/camera-framing'
import type { Vec3 } from '../camera/camera-framing'
import { interpolatePose } from '../camera/camera-pose'
import type { CameraPose } from '../camera/camera-pose'
import { MS_PER_SECOND } from '../theme/scene-metrics'

export type CameraRig = {
  apply(pose: CameraPose): void
  animateTo(pose: CameraPose, durationMs: number): void
  currentPose(): CameraPose
  tick(elapsedSeconds: number): void
  setAspect(aspect: number): void
  isPointInView(point: Vec3, margin: number): boolean
  dispose(): void
}

type Tween = {
  from: CameraPose
  to: CameraPose
  startSeconds: number | null
  durationSeconds: number
}

// Reused across isPointInView calls (runs on every hjkl) to avoid per-call allocation.
const frustum = new THREE.Frustum()
const projScreenMatrix = new THREE.Matrix4()
const sphere = new THREE.Sphere()
const point = new THREE.Vector3()

/**
 * Perspective rig coexisting with OrbitControls: `applyPose` owns orientation via
 * `controls.target`/`controls.update()` — `camera.lookAt` is never called (risk 1) — and the
 * fov is re-applied via `updateProjectionMatrix()` every frame so a tween doesn't snap (risk 8).
 * The only `setAnimationLoop` in the app lives in create-scene; this owns no loop, it just
 * applies whatever `tick` is fed.
 */
export function createCameraRig(
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls
): CameraRig {
  let tween: Tween | null = null

  const cancelTween = (): void => {
    tween = null
  }
  controls.addEventListener('start', cancelTween)

  const applyPose = (pose: CameraPose): void => {
    camera.position.set(pose.position.x, pose.position.y, pose.position.z)
    camera.fov = pose.fov
    camera.updateProjectionMatrix()
    controls.target.set(pose.lookAt.x, pose.lookAt.y, pose.lookAt.z)
    controls.update()
  }

  const currentPose = (): CameraPose => ({
    position: { x: camera.position.x, y: camera.position.y, z: camera.position.z },
    lookAt: { x: controls.target.x, y: controls.target.y, z: controls.target.z },
    fov: camera.fov
  })

  return {
    apply(pose) {
      tween = null
      applyPose(pose)
    },
    animateTo(pose, durationMs) {
      if (durationMs <= 0) {
        tween = null
        applyPose(pose)
        return
      }
      tween = {
        from: currentPose(),
        to: pose,
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
      applyPose(interpolatePose(tween.from, tween.to, easeInOutCubic(t)))
      if (t >= 1) {
        tween = null
      }
    },
    currentPose,
    setAspect(aspect) {
      camera.aspect = aspect
      camera.updateProjectionMatrix()
    },
    isPointInView(target, margin) {
      camera.updateMatrixWorld()
      projScreenMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
      frustum.setFromProjectionMatrix(projScreenMatrix)
      point.set(target.x, target.y, target.z)
      sphere.set(point, margin)
      return frustum.intersectsSphere(sphere)
    },
    dispose() {
      controls.removeEventListener('start', cancelTween)
    }
  }
}
