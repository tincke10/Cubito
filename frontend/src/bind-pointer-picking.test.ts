import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { bindPointerPicking } from './bind-pointer-picking'
import type { BindPointerPickingDeps } from './bind-pointer-picking'
import { createSceneStore } from './application/scene-store'
import type { SceneStore } from './application/scene-store'
import type { CameraHeight } from './presentation/camera/camera-pose'
import type { CameraHeightController } from './presentation/input/camera-height-controller'
import type { WorktreeId } from './domain/worktree-graph/types'
import { NODE_SURFACE_NAME } from './presentation/scene/node-mesh'
import { PICK_DRAG_SLOP_PX } from './presentation/theme/scene-metrics'

type PickRect = { left: number; top: number; width: number; height: number }
const RECT: PickRect = { left: 0, top: 0, width: 400, height: 300 }

// A tall, narrow-fov camera keeps rays close to vertical (unlike node-pick.test.ts's topDownCamera,
// whose closer, wider view visibly tilts a ray toward the origin) — needed so a down/up pair
// straddling the seam between two adjacent node boxes resolves to the box it targets, not the
// neighbour a tilted ray grazes on its way through. fov is derived to keep the same world extent
// (and thus the same px-per-world-unit) visible at the node plane as a closer camera would.
const CAMERA_HEIGHT = 1000
const NODE_PLANE_Y = 0.5
const VIEW_HALF_EXTENT = 4
const FOV_DEG = (2 * Math.atan(VIEW_HALF_EXTENT / (CAMERA_HEIGHT - NODE_PLANE_Y)) * 180) / Math.PI

const topDownCamera = (): THREE.PerspectiveCamera => {
  const camera = new THREE.PerspectiveCamera(FOV_DEG, 1, 0.1, 2000)
  camera.position.set(0, CAMERA_HEIGHT, 0)
  camera.up.set(0, 0, -1)
  camera.lookAt(0, 0, 0)
  camera.updateMatrixWorld()
  return camera
}

/** A minimal node group: a surface cube carrying userData.worktreeId, mirroring node-mesh.ts's
 *  real shape (node-pick.ts filters raycast hits to NODE_SURFACE_NAME). */
const nodeGroup = (worktreeId: string, x: number, z: number): THREE.Group => {
  const group = new THREE.Group()
  group.position.set(x, 0, z)
  group.userData.worktreeId = worktreeId
  const surface = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1))
  surface.name = NODE_SURFACE_NAME
  surface.position.set(0, 0.5, 0)
  group.add(surface)
  group.updateMatrixWorld(true)
  return group
}

const worldCenterOf = (group: THREE.Group): THREE.Vector3 => {
  const target = new THREE.Vector3()
  group.children[0]!.getWorldPosition(target)
  return target
}

/** Inverse of node-pick.ts's screenToNdc — projects a world point through the camera, then maps
 *  its NDC back to screen coordinates on the fake canvas's rect, so no pixel is hardcoded. */
const screenPointFor = (
  camera: THREE.Camera,
  world: THREE.Vector3,
  rect: PickRect
): { x: number; y: number } => {
  const ndc = world.clone().project(camera)
  return {
    x: rect.left + ((ndc.x + 1) / 2) * rect.width,
    y: rect.top + ((1 - ndc.y) / 2) * rect.height
  }
}

/** Far outside every node's screen footprint below, but still inside the rect. */
const EMPTY_SPACE_POINT = { x: RECT.left + RECT.width * 0.99, y: RECT.top + RECT.height * 0.99 }

type FakeCanvas = {
  style: { cursor: string }
  listeners: Record<string, ((event: unknown) => void)[]>
  addEventListener(type: string, cb: (event: unknown) => void): void
  removeEventListener(type: string, cb: (event: unknown) => void): void
  getBoundingClientRect(): PickRect
}

const createFakeCanvas = (): FakeCanvas => {
  const listeners: Record<string, ((event: unknown) => void)[]> = {}
  return {
    style: { cursor: '' },
    listeners,
    addEventListener(type, cb) {
      ;(listeners[type] ??= []).push(cb)
    },
    removeEventListener(type, cb) {
      listeners[type] = (listeners[type] ?? []).filter((l) => l !== cb)
    },
    getBoundingClientRect: () => RECT
  }
}

const fire = (canvas: FakeCanvas, type: string, point: { x: number; y: number }): void => {
  for (const cb of canvas.listeners[type] ?? []) cb({ clientX: point.x, clientY: point.y })
}

type FakeHeights = Pick<CameraHeightController, 'goTo' | 'onSelectionChanged'> & {
  goToCalls: CameraHeight[]
  selectionCalls: (WorktreeId | null)[]
}

const createFakeHeights = (): FakeHeights => ({
  goToCalls: [],
  selectionCalls: [],
  goTo(height) {
    this.goToCalls.push(height)
    return true
  },
  onSelectionChanged(id) {
    this.selectionCalls.push(id)
  }
})

function setup(sceneModeOpen: 'systemView' | 'diffView' | 'compareView' | null = null) {
  const store: SceneStore = createSceneStore()
  if (sceneModeOpen === 'systemView') store.dispatchSystemView({ type: 'open', nodeId: '/wt/a' })
  if (sceneModeOpen === 'diffView')
    store.dispatchDiffView({ type: 'open', nodeId: 'wt-a', baseRef: 'refs/heads/main' })
  if (sceneModeOpen === 'compareView') store.dispatchCompareView({ type: 'open', members: [] })

  const camera = topDownCamera()
  const canvas = createFakeCanvas()
  // Touching boxes (each a 1×1×1 cube, boundary at x=0.5) so a down/up pair straddling the seam
  // is both a different node AND within the pixel slop — isolating the nodeId-match branch from
  // the drag-slop branch, which two centers 2 world units apart would not do.
  const nodeA = nodeGroup('wt-a', 0, 0)
  const nodeB = nodeGroup('wt-b', 1, 0)
  const heights = createFakeHeights()
  const deps: BindPointerPickingDeps = {
    store,
    canvas: canvas as unknown as BindPointerPickingDeps['canvas'],
    camera,
    pickableObjects: () => [nodeA, nodeB],
    heights
  }
  const detach = bindPointerPicking(deps)
  return {
    store,
    canvas,
    camera,
    nodeA,
    nodeB,
    heights,
    detach,
    pointOf: (group: THREE.Group) => screenPointFor(camera, worldCenterOf(group), RECT),
    pointAtWorldX: (worldX: number) =>
      screenPointFor(camera, new THREE.Vector3(worldX, 0.5, 0), RECT)
  }
}

describe('bindPointerPicking — hover cursor', () => {
  it('pointermove over a node sets cursor pointer; over empty space clears it', () => {
    const { canvas, nodeA, pointOf } = setup()

    fire(canvas, 'pointermove', pointOf(nodeA))
    expect(canvas.style.cursor).toBe('pointer')

    fire(canvas, 'pointermove', EMPTY_SPACE_POINT)
    expect(canvas.style.cursor).toBe('')
  })
})

describe('bindPointerPicking — click to select', () => {
  it('pointerdown + pointerup on the same node within the slop selects it and notifies heights', () => {
    const { canvas, store, heights, nodeA, pointOf } = setup()
    const point = pointOf(nodeA)

    fire(canvas, 'pointerdown', point)
    fire(canvas, 'pointerup', point)

    expect(store.get().selection.selectedId).toBe('wt-a')
    expect(heights.selectionCalls).toEqual(['wt-a'])
  })

  it('a pointerup farther than PICK_DRAG_SLOP_PX from pointerdown does not select', () => {
    const { canvas, store, heights, nodeA, pointOf } = setup()
    const down = pointOf(nodeA)
    const up = { x: down.x + PICK_DRAG_SLOP_PX * 2, y: down.y }

    fire(canvas, 'pointerdown', down)
    fire(canvas, 'pointerup', up)

    expect(store.get().selection.selectedId).toBeNull()
    expect(heights.selectionCalls).toEqual([])
  })

  it('pointerup on a different node than pointerdown does not select', () => {
    const { canvas, store, heights, pointAtWorldX } = setup()
    // Straddles the wt-a/wt-b seam at x=0.5, within the pixel slop, so this fails on the
    // nodeId-mismatch check specifically, not on drag distance.
    const down = pointAtWorldX(0.48)
    const up = pointAtWorldX(0.52)

    fire(canvas, 'pointerdown', down)
    fire(canvas, 'pointerup', up)

    expect(store.get().selection.selectedId).toBeNull()
    expect(heights.selectionCalls).toEqual([])
  })
})

describe('bindPointerPicking — double-click to foco', () => {
  it('dblclick on a node selects it and calls heights.goTo("foco")', () => {
    const { canvas, store, heights, nodeA, pointOf } = setup()

    fire(canvas, 'dblclick', pointOf(nodeA))

    expect(store.get().selection.selectedId).toBe('wt-a')
    expect(heights.goToCalls).toEqual(['foco'])
  })
})

describe('bindPointerPicking — ignored while a scene mode is open', () => {
  it.each(['systemView', 'diffView', 'compareView'] as const)(
    'every handler is a no-op while %s is open',
    (mode) => {
      const { canvas, store, heights, nodeA, pointOf } = setup(mode)
      const point = pointOf(nodeA)

      fire(canvas, 'pointermove', point)
      expect(canvas.style.cursor).toBe('')

      fire(canvas, 'pointerdown', point)
      fire(canvas, 'pointerup', point)
      expect(store.get().selection.selectedId).toBeNull()
      expect(heights.selectionCalls).toEqual([])

      fire(canvas, 'dblclick', point)
      expect(heights.goToCalls).toEqual([])
    }
  )
})

describe('bindPointerPicking — detach', () => {
  it('the returned detach removes all four listeners', () => {
    const { canvas, detach } = setup()

    detach()

    expect(canvas.listeners['pointermove']).toEqual([])
    expect(canvas.listeners['pointerdown']).toEqual([])
    expect(canvas.listeners['pointerup']).toEqual([])
    expect(canvas.listeners['dblclick']).toEqual([])
  })
})
