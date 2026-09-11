import type { SceneStore } from '../../application/scene-store'
import type { WorktreeId } from '../../domain/worktree-graph/types'
import { frameIsland } from '../camera/camera-framing'
import type { CameraFraming, Vec3 } from '../camera/camera-framing'
import { panPoseTo } from '../camera/camera-pose'
import type { CameraHeight, CameraPose } from '../camera/camera-pose'
import { heightDurationMs, poseForExtent, poseForHeight } from '../camera/height-presets'
import { islandEntrySelection } from '../navigation/selection-model'
import { NODE_SIZE } from '../theme/scene-metrics'

/** The subset of camera-rig the controller drives — never the camera/frustum directly. */
export type CameraRigLike = {
  animateTo(pose: CameraPose, durationMs: number): void
  currentPose(): CameraPose
  isPointInView(point: Vec3, margin: number): boolean
}

/** Ground-truth node positions, supplied by whatever owns the THREE scene (graph-view). */
export type ScenePositions = {
  nodeCenter(id: WorktreeId): Vec3 | null
  nodeCenters(): Vec3[]
}

export type CameraHeightControllerDeps = {
  store: SceneStore
  rig: CameraRigLike
  scenePositions: ScenePositions
}

export type CameraHeightController = {
  current(): CameraHeight
  /** Re-anchors in place (no push) when `height` is already current; otherwise pushes the live
   *  pose and tweens. Returns whether it pushed. A no-op (missing anchor) also returns false. */
  goTo(height: CameraHeight): boolean
  /** Tweens back to the popped pose at the popped height's own duration. False on an empty stack. */
  pop(): boolean
  /** Tab/⌘P island activate: 'general' re-anchors to its fixed preset over the new island; every
   *  other height fits the island's extent. Never pushes. */
  reanchorIsland(repoId: string): void
  /** Fan-out litter reframe at the CURRENT fov, so a reframe never changes height. */
  animateToExtent(framing: CameraFraming, durationMs: number): void
  /** foco: always re-targets. isla: pans only when the selection left the frustum. Otherwise no-op. */
  onSelectionChanged(id: WorktreeId | null): void
}

type StackEntry = { height: CameraHeight; pose: CameraPose }

/** Owns the four-height pose stack (design escena-3d-alturas) — the only place camera-height
 *  math and the Esc-unwound push/pop history live. */
export function createCameraHeightController(
  deps: CameraHeightControllerDeps
): CameraHeightController {
  const { store, rig, scenePositions } = deps
  const stack: StackEntry[] = []

  const current = (): CameraHeight => store.get().camera.height

  const groundAnchor = (repoId: string | null): Vec3 | null => {
    const id = islandEntrySelection(store.get().graph, repoId)
    if (id === null) return null
    const center = scenePositions.nodeCenter(id)
    return center ? { x: center.x, y: 0, z: center.z } : null
  }

  const computePose = (height: CameraHeight): CameraPose | null => {
    if (height === 'foco') {
      const selectedId = store.get().selection.selectedId
      const selection = selectedId !== null ? scenePositions.nodeCenter(selectedId) : null
      if (selection === null) return null
      const anchor = groundAnchor(store.get().repos.activeRepoId) ?? { x: 0, y: 0, z: 0 }
      return poseForHeight('foco', anchor, selection)
    }
    const anchor = groundAnchor(store.get().repos.activeRepoId)
    if (anchor === null) return null
    return poseForHeight(height, anchor, null)
  }

  const goTo = (height: CameraHeight): boolean => {
    const pose = computePose(height)
    if (pose === null) return false
    const from = current()
    if (height === from) {
      rig.animateTo(pose, heightDurationMs(height))
      return false
    }
    stack.push({ height: from, pose: rig.currentPose() })
    rig.animateTo(pose, heightDurationMs(height))
    store.update({ camera: { height } })
    return true
  }

  const pop = (): boolean => {
    const top = stack.pop()
    if (!top) return false
    rig.animateTo(top.pose, heightDurationMs(top.height))
    store.update({ camera: { height: top.height } })
    return true
  }

  const reanchorIsland = (repoId: string): void => {
    const height = current()
    if (height === 'general') {
      const anchor = groundAnchor(repoId) ?? { x: 0, y: 0, z: 0 }
      rig.animateTo(poseForHeight('general', anchor, null), heightDurationMs('general'))
      return
    }
    const framing = frameIsland(store.get().graph, repoId, scenePositions.nodeCenter)
    rig.animateTo(poseForExtent(framing, rig.currentPose().fov), heightDurationMs(height))
  }

  const animateToExtent = (framing: CameraFraming, durationMs: number): void => {
    rig.animateTo(poseForExtent(framing, rig.currentPose().fov), durationMs)
  }

  const onSelectionChanged = (id: WorktreeId | null): void => {
    const height = current()
    if (height !== 'foco' && height !== 'isla') return
    const center = id !== null ? scenePositions.nodeCenter(id) : null
    if (center === null) return
    if (height === 'foco') {
      const anchor = groundAnchor(store.get().repos.activeRepoId) ?? { x: 0, y: 0, z: 0 }
      rig.animateTo(poseForHeight('foco', anchor, center), heightDurationMs('foco'))
      return
    }
    if (!rig.isPointInView(center, NODE_SIZE)) {
      rig.animateTo(panPoseTo(rig.currentPose(), center), heightDurationMs('isla'))
    }
  }

  return { current, goTo, pop, reanchorIsland, animateToExtent, onSelectionChanged }
}
