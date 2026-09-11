import * as THREE from 'three'
import type { WorktreeId } from '../../domain/worktree-graph/types'
import { NODE_SURFACE_NAME } from './node-mesh'

export type PickPoint = { x: number; y: number }
export type PickRect = { left: number; top: number; width: number; height: number }
export type Ndc = { x: number; y: number }

export const screenToNdc = (point: PickPoint, rect: PickRect): Ndc => ({
  x: ((point.x - rect.left) / rect.width) * 2 - 1,
  y: -((point.y - rect.top) / rect.height) * 2 + 1
})

const raycaster = new THREE.Raycaster()

/** Raycasts the node groups recursively, accepting only NODE_SURFACE_NAME hits (design C7 —
 *  the glow sprite and ground shadow would otherwise register hits well outside the cube),
 *  then walks up to the ancestor carrying userData.worktreeId. Nearest wins (hits are sorted
 *  by ray distance ascending). */
export const pickNodeId = (
  camera: THREE.Camera,
  ndc: Ndc,
  objects: readonly THREE.Object3D[]
): WorktreeId | null => {
  raycaster.setFromCamera(new THREE.Vector2(ndc.x, ndc.y), camera)
  const hits = raycaster.intersectObjects([...objects], true)
  for (const hit of hits) {
    if (hit.object.name !== NODE_SURFACE_NAME) continue
    let node: THREE.Object3D | null = hit.object
    while (node !== null && node.userData.worktreeId === undefined) node = node.parent
    if (node !== null) return node.userData.worktreeId as WorktreeId
  }
  return null
}

/** Click vs. orbit-drag disambiguation (design D14): both axes within slopPx. */
export const isClickNotDrag = (down: PickPoint, up: PickPoint, slopPx: number): boolean =>
  Math.abs(down.x - up.x) <= slopPx && Math.abs(down.y - up.y) <= slopPx
