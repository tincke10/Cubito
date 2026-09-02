import type { NodeKind } from '../../domain/worktree-graph/types'
import type { NodeState } from './node-state'
import {
  ELEVATION,
  ROOT_MIN_ELEVATION,
  SHADOW_BASE_OPACITY,
  SHADOW_BASE_RADIUS,
  SHADOW_OPACITY_GAIN,
  SHADOW_RADIUS_GAIN
} from './scene-metrics'

export type Elevation = {
  height: number
  shadow: { radius: number; opacity: number } | null
}

/** archived is the only shadowless, always-grounded state (design §0.1); the root floor
 *  still lifts an archived root's height, since no mockup measurement contradicts it. */
export const elevationFor = (state: NodeState, kind: NodeKind): Elevation => {
  const base = ELEVATION[state]
  const height = kind === 'root' ? Math.max(base, ROOT_MIN_ELEVATION) : base
  const shadow =
    state === 'archived'
      ? null
      : {
          radius: SHADOW_BASE_RADIUS + SHADOW_RADIUS_GAIN * height,
          opacity: SHADOW_BASE_OPACITY + SHADOW_OPACITY_GAIN * height
        }
  return { height, shadow }
}
