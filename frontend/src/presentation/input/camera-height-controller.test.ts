import { describe, expect, it, vi } from 'vitest'
import { createCameraHeightController } from './camera-height-controller'
import type { ScenePositions } from './camera-height-controller'
import { createSceneStore } from '../../application/scene-store'
import { poseForExtent, poseForHeight } from '../camera/height-presets'
import { panPoseTo } from '../camera/camera-pose'
import type { CameraPose } from '../camera/camera-pose'
import { frameIsland } from '../camera/camera-framing'
import type { Vec3 } from '../camera/camera-framing'
import { inertActivity } from '../../domain/worktree-graph/node-activity'
import type { WorktreeGraph, WorktreeNode } from '../../domain/worktree-graph/types'

const node = (
  id: string,
  repoId: string,
  isMain = false,
  childIds: readonly string[] = []
): WorktreeNode => ({
  id,
  repoId,
  branch: id,
  path: `/tmp/${id}`,
  status: 'clean',
  isMain,
  kind: isMain ? 'root' : 'worktree',
  parentId: null,
  childIds,
  activity: inertActivity()
})

/** Two islands (repos 'r1'/'r2'), r1 has a flagged main; r2 does not (first-root fallback). */
function buildTwoRepoGraph(): WorktreeGraph {
  const nodes = new Map<string, WorktreeNode>([
    ['r1-main', node('r1-main', 'r1', true)],
    ['r1-other', node('r1-other', 'r1')],
    ['r2-root', node('r2-root', 'r2')]
  ])
  return { nodes, edges: [], rootIds: ['r1-main', 'r1-other', 'r2-root'] }
}

const CENTERS: Record<string, Vec3> = {
  'r1-main': { x: 10, y: 0.52, z: -4 },
  'r1-other': { x: 15, y: 0, z: -4 },
  'r2-root': { x: -30, y: 0, z: 8 }
}

const REPO_1 = { id: 'r1', path: '/r1', displayName: 'R1', kind: 'git' as const }
const REPO_2 = { id: 'r2', path: '/r2', displayName: 'R2', kind: 'git' as const }

function fakeScenePositions(centers: Record<string, Vec3> = CENTERS): ScenePositions {
  return {
    nodeCenter: (id) => centers[id] ?? null,
    nodeCenters: () => Object.values(centers)
  }
}

const FAKE_FOV = 38
function fakeCameraRig(currentPose: CameraPose) {
  const rig = {
    animateTo: vi.fn(),
    currentPose: vi.fn((): CameraPose => rig.currentPoseValue),
    isPointInView: vi.fn(() => true),
    currentPoseValue: currentPose
  }
  return rig
}

const DEFAULT_POSE: CameraPose = {
  position: { x: 0, y: 0, z: 0 },
  lookAt: { x: 0, y: 0, z: 0 },
  fov: FAKE_FOV
}

function setup(overrides: { selectedId?: string | null; activeRepoId?: string | null } = {}) {
  const store = createSceneStore()
  store.update({
    graph: buildTwoRepoGraph(),
    selection: { selectedId: overrides.selectedId ?? null }
  })
  store.dispatchRepos({ type: 'set-list', list: [REPO_1, REPO_2] })
  if (overrides.activeRepoId !== undefined) {
    store.update({ repos: { ...store.get().repos, activeRepoId: overrides.activeRepoId } })
  }
  const rig = fakeCameraRig(DEFAULT_POSE)
  const scenePositions = fakeScenePositions()
  const heights = createCameraHeightController({ store, rig, scenePositions })
  return { store, rig, scenePositions, heights }
}

describe('createCameraHeightController', () => {
  it('goTo pushes the live pose and tweens to the destination preset', () => {
    const { store, rig, heights } = setup({ activeRepoId: 'r1' })
    const orbited: CameraPose = {
      position: { x: 1, y: 2, z: 3 },
      lookAt: { x: 4, y: 5, z: 6 },
      fov: 30
    }
    rig.currentPoseValue = orbited

    const pushed = heights.goTo('general')

    expect(pushed).toBe(true)
    expect(store.get().camera.height).toBe('general')
    const anchor = { x: CENTERS['r1-main']!.x, y: 0, z: CENTERS['r1-main']!.z }
    expect(rig.animateTo).toHaveBeenCalledWith(poseForHeight('general', anchor, null), 600)
  })

  it('goTo returns false and re-anchors without pushing when the height is already current', () => {
    const { store, rig, heights } = setup({ activeRepoId: 'r1' })
    expect(store.get().camera.height).toBe('isla')

    const pushed = heights.goTo('isla')

    expect(pushed).toBe(false)
    expect(store.get().camera.height).toBe('isla')
    const anchor = { x: CENTERS['r1-main']!.x, y: 0, z: CENTERS['r1-main']!.z }
    expect(rig.animateTo).toHaveBeenCalledWith(poseForHeight('isla', anchor, null), 420)
  })

  it('goTo restores a hand-orbited pose exactly on the matching pop', () => {
    const { rig, heights } = setup({ activeRepoId: 'r1' })
    const orbited: CameraPose = {
      position: { x: 9, y: 8, z: 7 },
      lookAt: { x: 6, y: 5, z: 4 },
      fov: 33
    }
    rig.currentPoseValue = orbited

    heights.goTo('general')
    rig.animateTo.mockClear()
    heights.pop()

    expect(rig.animateTo).toHaveBeenCalledWith(orbited, 420) // popped height was 'isla' -> 420ms
  })

  it("pop tweens with the popped height's duration and restores that height", () => {
    const { store, rig, heights } = setup({ activeRepoId: 'r1' })
    heights.goTo('foco') // no selection -> no-op, stays isla with no push... use general instead
    heights.goTo('general') // isla -> general, pushes isla
    rig.animateTo.mockClear()

    const popped = heights.pop()

    expect(popped).toBe(true)
    expect(store.get().camera.height).toBe('isla')
    expect(rig.animateTo).toHaveBeenCalledTimes(1)
    expect(rig.animateTo.mock.calls[0]![1]).toBe(420) // isla's own duration
  })

  it('pop on an empty stack is a no-op returning false', () => {
    const { store, rig, heights } = setup({ activeRepoId: 'r1' })
    const popped = heights.pop()
    expect(popped).toBe(false)
    expect(rig.animateTo).not.toHaveBeenCalled()
    expect(store.get().camera.height).toBe('isla')
  })

  it("the store's camera.height follows every goTo and pop", () => {
    const { store, heights } = setup({ activeRepoId: 'r1' })
    heights.goTo('general')
    expect(store.get().camera.height).toBe('general')
    heights.goTo('comparar')
    expect(store.get().camera.height).toBe('comparar')
    heights.pop()
    expect(store.get().camera.height).toBe('general')
    heights.pop()
    expect(store.get().camera.height).toBe('isla')
  })

  it('reanchorIsland fits the island extent in isla, and holds the fixed preset in general', () => {
    const { store, rig, scenePositions, heights } = setup({ activeRepoId: 'r1' })

    heights.reanchorIsland('r2')
    const framing = frameIsland(store.get().graph, 'r2', scenePositions.nodeCenter)
    expect(rig.animateTo).toHaveBeenLastCalledWith(poseForExtent(framing, FAKE_FOV), 420)

    heights.goTo('general')
    rig.animateTo.mockClear()
    heights.reanchorIsland('r2')
    const anchor = { x: CENTERS['r2-root']!.x, y: 0, z: CENTERS['r2-root']!.z }
    expect(rig.animateTo).toHaveBeenCalledWith(poseForHeight('general', anchor, null), 600)
  })

  it('animateToExtent keeps the current fov', () => {
    const { rig, heights, store } = setup({ activeRepoId: 'r1' })
    rig.currentPoseValue = { ...DEFAULT_POSE, fov: 51 }
    const framing = frameIsland(store.get().graph, 'r1', fakeScenePositions().nodeCenter)

    heights.animateToExtent(framing, 777)

    expect(rig.animateTo).toHaveBeenCalledWith(poseForExtent(framing, 51), 777)
  })

  it('onSelectionChanged always re-targets in foco', () => {
    const { store, rig, heights } = setup({ activeRepoId: 'r1', selectedId: 'r1-other' })
    heights.goTo('foco')
    rig.animateTo.mockClear()

    heights.onSelectionChanged('r1-main')

    const anchor = { x: CENTERS['r1-main']!.x, y: 0, z: CENTERS['r1-main']!.z }
    expect(rig.animateTo).toHaveBeenCalledWith(
      poseForHeight('foco', anchor, CENTERS['r1-main']!),
      420
    )
    expect(store.get().camera.height).toBe('foco') // re-anchor, no push
  })

  it('onSelectionChanged pans in isla only when isPointInView is false', () => {
    const { rig, heights } = setup({ activeRepoId: 'r1' })
    expect(rig.isPointInView).toBeDefined()
    rig.isPointInView.mockReturnValue(true)

    heights.onSelectionChanged('r1-other')
    expect(rig.animateTo).not.toHaveBeenCalled()

    rig.isPointInView.mockReturnValue(false)
    heights.onSelectionChanged('r1-other')
    expect(rig.animateTo).toHaveBeenCalledWith(
      panPoseTo(rig.currentPoseValue, CENTERS['r1-other']!),
      420
    )
  })

  it('onSelectionChanged never moves the camera in comparar', () => {
    const { rig, heights } = setup({ activeRepoId: 'r1' })
    heights.goTo('comparar')
    rig.animateTo.mockClear()

    heights.onSelectionChanged('r1-other')

    expect(rig.animateTo).not.toHaveBeenCalled()
  })

  it('the anchor is the active island main node ground point, with y forced to 0', () => {
    const { rig, heights } = setup({ activeRepoId: 'r1' })
    heights.goTo('general')
    // r1-main's raw y is 0.52 (CENTERS) but the anchor forces y=0 before adding the preset offset.
    const groundedAnchor = { x: CENTERS['r1-main']!.x, y: 0, z: CENTERS['r1-main']!.z }
    expect(rig.animateTo).toHaveBeenCalledWith(poseForHeight('general', groundedAnchor, null), 600)
  })

  it("the anchor falls back to the island's first root node when no node is flagged isMain", () => {
    const { rig, heights } = setup({ activeRepoId: 'r2' })
    const pushed = heights.goTo('general')
    expect(pushed).toBe(true)
    const anchor = { x: CENTERS['r2-root']!.x, y: 0, z: CENTERS['r2-root']!.z }
    expect(rig.animateTo).toHaveBeenCalledWith(poseForHeight('general', anchor, null), 600)
  })

  it('goTo targeting general/isla/comparar is a no-op when the active island has zero nodes', () => {
    const { store, rig, heights } = setup({ activeRepoId: 'r1' })
    store.update({ graph: { nodes: new Map(), edges: [], rootIds: [] } })

    expect(heights.goTo('general')).toBe(false)
    expect(heights.goTo('comparar')).toBe(false)
    expect(rig.animateTo).not.toHaveBeenCalled()
    expect(store.get().camera.height).toBe('isla')
  })
})
