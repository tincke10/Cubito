import type { NodeKind } from '../../domain/worktree-graph/types'
import type { NodeDecorations, NodeState } from './node-state'
import type { FaceTriad, ScenePalette } from './scene-palette'
import { SELECTION_RING_RADIUS } from './scene-metrics'

export type NodeSurface =
  | { kind: 'solid'; faces: FaceTriad }
  | { kind: 'wireframe'; stroke: number; dash: readonly [number, number]; opacity: number }

export type NodeVisual = {
  surface: NodeSurface
  glow: { color: number; intensity: number } | null
  pulse: boolean
  ring: { color: number; radius: number } | null
  dot: { color: number; pulse: boolean } | null
  /** Pass-through of decorations.dimmed — node-mesh scales opacity by DIM_OPACITY when true. */
  dimmed: boolean
}

const GLOW_INTENSITY_ROOT = 1.0
const GLOW_INTENSITY_WORKING = 0.85
const GLOW_INTENSITY_WAITING_INPUT = 0.9

const surfaceFor = (kind: NodeKind, state: NodeState, palette: ScenePalette): NodeSurface => {
  if (state === 'archived')
    return { kind: 'wireframe', stroke: palette.archivedStroke, dash: [4, 3], opacity: 0.5 }
  if (state === 'spawning')
    return { kind: 'wireframe', stroke: palette.spawningStroke, dash: [5, 4], opacity: 0.8 }
  if (state === 'waiting-input') return { kind: 'solid', faces: palette.waitingFaces } // attention beats identity
  if (kind === 'root') return { kind: 'solid', faces: palette.rootFaces }
  if (state === 'idle') return { kind: 'solid', faces: palette.idleFaces }
  return { kind: 'solid', faces: palette.activeFaces } // working, dirty, unread
}

const glowFor = (
  kind: NodeKind,
  state: NodeState,
  surface: NodeSurface
): { color: number; intensity: number } | null => {
  if (surface.kind !== 'solid') return null
  if (kind === 'root') return { color: surface.faces.top, intensity: GLOW_INTENSITY_ROOT }
  if (state === 'working') return { color: surface.faces.top, intensity: GLOW_INTENSITY_WORKING }
  if (state === 'waiting-input')
    return { color: surface.faces.top, intensity: GLOW_INTENSITY_WAITING_INPUT }
  return null // dirty, unread, idle — decorations only, no glow (design §0.2 correction)
}

export const nodeVisual = (
  kind: NodeKind,
  state: NodeState,
  decorations: NodeDecorations,
  palette: ScenePalette
): NodeVisual => {
  const surface = surfaceFor(kind, state, palette)
  return {
    surface,
    glow: glowFor(kind, state, surface),
    pulse: state === 'waiting-input',
    ring: decorations.selectionRing
      ? { color: palette.accent, radius: SELECTION_RING_RADIUS }
      : null,
    dot: decorations.unreadDot ? { color: palette.accent, pulse: true } : null,
    dimmed: decorations.dimmed
  }
}
