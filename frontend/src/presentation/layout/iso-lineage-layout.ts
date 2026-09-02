import type { WorktreeGraph, WorktreeId } from '../../domain/worktree-graph/types'
import { childrenOf, depthOf } from '../../domain/worktree-graph/graph-traversal'
import {
  BRANCH_FAN_SPAN_DEG,
  DEPTH_DECAY,
  DEPTH_STEP,
  MIN_ANGULAR_SEPARATION,
  ROOT_FAN_SPAN_DEG,
  ROOT_SPREAD
} from '../theme/scene-metrics'

export type Vec3 = { x: number; y: number; z: number }

const DEG_TO_RAD = Math.PI / 180
/** Arbitrary "away from the viewer" direction for the single-root case, which has no ambient angle to inherit. */
const SOLE_ROOT_OUTWARD_RAD = Math.PI

type Frontier = { readonly id: WorktreeId; readonly position: Vec3; readonly outwardRad: number }

/**
 * Radial cone-tree ground layout (design §7.8, derived from Main.dc.html's inverted
 * projection): each generation fans around its parent's own outward direction, radius
 * decaying per depth but widening rather than crowding a wide sibling set. `y` is
 * always 0 — elevation is `node-elevation.ts`'s job, never this module's.
 */
export function layoutByIsoLineage(graph: WorktreeGraph): Map<WorktreeId, Vec3> {
  const positions = new Map<WorktreeId, Vec3>()
  const frontier: Frontier[] = []

  const rootCount = graph.rootIds.length
  graph.rootIds.forEach((rootId, index) => {
    const single = rootCount <= 1
    const outwardRad = single ? SOLE_ROOT_OUTWARD_RAD : (-90 + (360 * index) / rootCount) * DEG_TO_RAD
    const position: Vec3 = single
      ? { x: 0, y: 0, z: 0 }
      : { x: Math.cos(outwardRad) * ROOT_SPREAD, y: 0, z: Math.sin(outwardRad) * ROOT_SPREAD }
    positions.set(rootId, position)
    frontier.push({ id: rootId, position, outwardRad })
  })

  while (frontier.length > 0) {
    const parent = frontier.shift()!
    const kids = childrenOf(graph, parent.id)
    if (kids.length === 0) {
      continue
    }

    const parentDepth = depthOf(graph, parent.id)
    const spanDeg = parentDepth === 0 ? ROOT_FAN_SPAN_DEG : BRANCH_FAN_SPAN_DEG
    const spanRad = spanDeg * DEG_TO_RAD
    const step = DEPTH_STEP * DEPTH_DECAY ** parentDepth
    const radius = Math.max(step, (kids.length * MIN_ANGULAR_SEPARATION) / spanRad)

    kids.forEach((childId, i) => {
      if (positions.has(childId)) {
        return
      }
      const angle = parent.outwardRad - spanRad / 2 + (spanRad * (i + 0.5)) / kids.length
      const position: Vec3 = {
        x: parent.position.x + Math.cos(angle) * radius,
        y: 0,
        z: parent.position.z + Math.sin(angle) * radius
      }
      positions.set(childId, position)
      frontier.push({ id: childId, position, outwardRad: angle })
    })
  }

  return positions
}
