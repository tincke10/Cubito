import type { WorktreeGraph, WorktreeId } from '../../domain/worktree-graph/types'
import { partitionGraphByRepo } from '../../domain/worktree-graph/repo-partition'
import { layoutByIsoLineage } from './iso-lineage-layout'
import type { Vec3 } from './iso-lineage-layout'
import { GALAXY_ISLAND_GAP, GALAXY_MIN_RING_RADIUS } from '../theme/scene-metrics'

const DEG_TO_RAD = Math.PI / 180

export type GalaxyLayoutOptions = { repoOrder?: readonly string[] }

/** repoOrder's known ids first (in that order), remaining ids appended lexicographically. */
const orderedRepoIds = (repoIds: readonly string[], repoOrder?: readonly string[]): string[] => {
  if (!repoOrder) return [...repoIds].sort()
  const known = repoOrder.filter((id) => repoIds.includes(id))
  const rest = repoIds.filter((id) => !repoOrder.includes(id)).sort()
  return [...known, ...rest]
}

const boundingRadius = (positions: Iterable<Vec3>): number => {
  let radius = 0
  for (const p of positions) radius = Math.max(radius, Math.hypot(p.x, p.z))
  return radius
}

/**
 * Drop-in replacement for `layoutByIsoLineage` (design §Area 2): partitions the graph by
 * repoId, lays out each partition independently, then rings the island centers so their
 * bounding circles never overlap. A single partition (0 or 1 repoId) delegates straight
 * to `layoutByIsoLineage` for byte-for-byte parity with today's single-repo layout.
 */
export function galaxyLayout(
  graph: WorktreeGraph,
  options?: GalaxyLayoutOptions
): Map<WorktreeId, Vec3> {
  const partitions = partitionGraphByRepo(graph)
  if (partitions.size <= 1) return layoutByIsoLineage(graph)

  const repoIds = orderedRepoIds([...partitions.keys()], options?.repoOrder)
  const localLayouts = repoIds.map((repoId) => layoutByIsoLineage(partitions.get(repoId)!))
  const rMax = Math.max(...localLayouts.map((positions) => boundingRadius(positions.values())))
  const n = repoIds.length
  const ringRadius = Math.max(
    GALAXY_MIN_RING_RADIUS,
    (2 * rMax + GALAXY_ISLAND_GAP) / (2 * Math.sin(Math.PI / n))
  )

  const result = new Map<WorktreeId, Vec3>()
  repoIds.forEach((repoId, index) => {
    const angleRad = (-90 + (360 * index) / n) * DEG_TO_RAD
    const centerX = Math.cos(angleRad) * ringRadius
    const centerZ = Math.sin(angleRad) * ringRadius
    for (const [id, local] of localLayouts[index]!) {
      result.set(id, { x: local.x + centerX, y: 0, z: local.z + centerZ })
    }
  })
  return result
}
