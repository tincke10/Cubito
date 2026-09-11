import type * as THREE from 'three'
import type { SceneStore } from './application/scene-store'
import type { WorktreeId } from './domain/worktree-graph/types'
import type { CameraHeightController } from './presentation/input/camera-height-controller'
import { isClickNotDrag, pickNodeId, screenToNdc } from './presentation/scene/node-pick'
import { PICK_DRAG_SLOP_PX } from './presentation/theme/scene-metrics'

export type BindPointerPickingDeps = {
  store: SceneStore
  canvas: HTMLElement & { style: { cursor: string } }
  camera: THREE.Camera
  pickableObjects: () => readonly THREE.Object3D[]
  heights: Pick<CameraHeightController, 'goTo' | 'onSelectionChanged'>
}

/**
 * Raycaster pointer wiring (design escena-3d-alturas §2.5): DOM event listeners only — all
 * hover/click/drag math lives in node-pick.ts. Declared exclusion from unit coverage (mirrors
 * create-scene.ts) because it drives real PointerEvents against a real canvas.
 */
export function bindPointerPicking(deps: BindPointerPickingDeps): () => void {
  const { store, canvas, camera, pickableObjects, heights } = deps
  let down: { nodeId: WorktreeId; x: number; y: number } | null = null

  const sceneModeOpen = (): boolean => {
    const state = store.get()
    return (
      state.systemView.view === 'open' ||
      state.diffView.view === 'open' ||
      state.compareView.view === 'open'
    )
  }

  const pick = (event: PointerEvent | MouseEvent): WorktreeId | null => {
    const rect = canvas.getBoundingClientRect()
    const ndc = screenToNdc({ x: event.clientX, y: event.clientY }, rect)
    return pickNodeId(camera, ndc, pickableObjects())
  }

  const onPointerMove = (event: PointerEvent): void => {
    if (sceneModeOpen()) return
    canvas.style.cursor = pick(event) !== null ? 'pointer' : ''
  }

  const onPointerDown = (event: PointerEvent): void => {
    if (sceneModeOpen()) return
    const nodeId = pick(event)
    down = nodeId !== null ? { nodeId, x: event.clientX, y: event.clientY } : null
  }

  const onPointerUp = (event: PointerEvent): void => {
    if (sceneModeOpen() || down === null) return
    const nodeId = pick(event)
    const up = { x: event.clientX, y: event.clientY }
    if (nodeId === down.nodeId && isClickNotDrag(down, up, PICK_DRAG_SLOP_PX)) {
      store.update({ selection: { selectedId: nodeId } })
      heights.onSelectionChanged(nodeId)
    }
    down = null
  }

  const onDoubleClick = (event: MouseEvent): void => {
    if (sceneModeOpen()) return
    const nodeId = pick(event)
    if (nodeId === null) return
    store.update({ selection: { selectedId: nodeId } })
    heights.goTo('foco')
  }

  canvas.addEventListener('pointermove', onPointerMove)
  canvas.addEventListener('pointerdown', onPointerDown)
  canvas.addEventListener('pointerup', onPointerUp)
  canvas.addEventListener('dblclick', onDoubleClick)

  return () => {
    canvas.removeEventListener('pointermove', onPointerMove)
    canvas.removeEventListener('pointerdown', onPointerDown)
    canvas.removeEventListener('pointerup', onPointerUp)
    canvas.removeEventListener('dblclick', onDoubleClick)
  }
}
