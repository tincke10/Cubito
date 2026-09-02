import type { WorktreeGraph, WorktreeId } from '../../domain/worktree-graph/types'
import { layoutByIsoLineage } from './iso-lineage-layout'
import type { Vec3 } from './iso-lineage-layout'

export type { Vec3 }

export type LineageLayoutOptions = {
  /** Distance between a parent and its children ring. */
  radius: number
}

/**
 * @deprecated Superseded by `layoutByIsoLineage` (design §7.8's radial cone tree, driven
 * by `scene-metrics.ts` constants). Kept as a compatibility shim purely because
 * `scene/graph-view.ts` still imports this signature and is out of scope for this task —
 * `options` is ignored. Remove once graph-view.ts is migrated to call `layoutByIsoLineage`
 * directly.
 */
export function layoutByLineage(graph: WorktreeGraph, _options: LineageLayoutOptions): Map<WorktreeId, Vec3> {
  return layoutByIsoLineage(graph)
}
