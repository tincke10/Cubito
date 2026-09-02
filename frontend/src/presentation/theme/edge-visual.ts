import type { NodeState } from './node-state'
import type { ScenePalette } from './scene-palette'
import {
  EDGE_OPACITY_FAINT,
  EDGE_OPACITY_FLOW,
  EDGE_OPACITY_NORMAL,
  EDGE_WIDTH_FAINT,
  EDGE_WIDTH_FLOW,
  EDGE_WIDTH_NORMAL,
  FAINT_DASH,
  FAINT_GAP,
  FLOW_CYCLES_PER_PERIOD,
  FLOW_DASH,
  FLOW_GAP,
  FLOW_PERIOD_SECONDS
} from './scene-metrics'

export type EdgeVisual = {
  color: number
  opacity: number
  width: number
  dash: { size: number; gap: number } | null
  flowing: boolean
}

/** Flow beats archived-faint: an edge into a working/waiting-input node always flows,
 *  even from an archived parent (design §0/precedence). */
export const edgeVisual = (fromState: NodeState, toState: NodeState, palette: ScenePalette): EdgeVisual => {
  if (toState === 'working' || toState === 'waiting-input') {
    return {
      color: palette.edgeFlow,
      opacity: EDGE_OPACITY_FLOW,
      width: EDGE_WIDTH_FLOW,
      dash: { size: FLOW_DASH, gap: FLOW_GAP },
      flowing: true
    }
  }
  if (fromState === 'archived' || toState === 'archived') {
    return {
      color: palette.edgeFaint,
      opacity: EDGE_OPACITY_FAINT,
      width: EDGE_WIDTH_FAINT,
      dash: { size: FAINT_DASH, gap: FAINT_GAP },
      flowing: false
    }
  }
  return { color: palette.edgeNormal, opacity: EDGE_OPACITY_NORMAL, width: EDGE_WIDTH_NORMAL, dash: null, flowing: false }
}

/** Global clock, no per-object phase state — every flowing edge marches in lockstep,
 *  march direction parent→child is negative (design §5.5). */
export const flowDashOffset = (elapsedSeconds: number): number =>
  -((elapsedSeconds % FLOW_PERIOD_SECONDS) / FLOW_PERIOD_SECONDS) * FLOW_CYCLES_PER_PERIOD * (FLOW_DASH + FLOW_GAP)
