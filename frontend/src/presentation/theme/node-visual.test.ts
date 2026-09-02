import { describe, expect, it } from 'vitest'
import { nodeVisual } from './node-visual'
import { NODE_STATES } from './node-state'
import type { NodeDecorations, NodeState } from './node-state'
import { NODE_KINDS } from '../../domain/worktree-graph/types'
import type { NodeKind } from '../../domain/worktree-graph/types'
import { darkPalette, lightPalette } from './scene-palette'
import type { ScenePalette } from './scene-palette'
import { SELECTION_RING_RADIUS } from './scene-metrics'

const decorationsOf = (overrides: Partial<NodeDecorations> = {}): NodeDecorations => ({
  unreadDot: false,
  diffLabel: null,
  waitingCallout: false,
  selectionRing: false,
  ...overrides
})

const wireframeStates: readonly NodeState[] = ['archived', 'spawning']

describe('nodeVisual', () => {
  it('never throws across the full NodeKind × NodeState × decoration × Theme cross product', () => {
    for (const kind of NODE_KINDS) {
      for (const state of NODE_STATES) {
        for (const selectionRing of [true, false]) {
          for (const unreadDot of [true, false]) {
            for (const palette of [darkPalette, lightPalette]) {
              expect(() =>
                nodeVisual(kind, state, decorationsOf({ selectionRing, unreadDot }), palette)
              ).not.toThrow()
            }
          }
        }
      }
    }
  })

  it('renders root as a solid rootFaces cube glowing in every state except archived/spawning', () => {
    for (const state of NODE_STATES) {
      const visual = nodeVisual('root', state, decorationsOf(), darkPalette)
      if (wireframeStates.includes(state)) {
        expect(visual.surface.kind).toBe('wireframe')
        expect(visual.glow).toBeNull()
        continue
      }
      if (state === 'waiting-input') {
        // attention beats identity — see the waiting-input assertion below
        expect(visual.surface.kind).toBe('solid')
      } else {
        expect(visual.surface).toEqual({ kind: 'solid', faces: darkPalette.rootFaces })
      }
      expect(visual.glow).not.toBeNull()
    }
  })

  it('renders worktree working/dirty/unread as solid activeFaces, glowing only for working', () => {
    const working = nodeVisual('worktree', 'working', decorationsOf(), darkPalette)
    const dirty = nodeVisual('worktree', 'dirty', decorationsOf(), darkPalette)
    const unread = nodeVisual('worktree', 'unread', decorationsOf(), darkPalette)
    for (const visual of [working, dirty, unread]) {
      expect(visual.surface).toEqual({ kind: 'solid', faces: darkPalette.activeFaces })
    }
    expect(working.glow).not.toBeNull()
    expect(dirty.glow).toBeNull()
    expect(unread.glow).toBeNull()
  })

  it('gives waiting-input the waitingFaces treatment even on root, pulsing and glowing', () => {
    for (const kind of NODE_KINDS) {
      const visual = nodeVisual(kind, 'waiting-input', decorationsOf(), darkPalette)
      expect(visual.surface).toEqual({ kind: 'solid', faces: darkPalette.waitingFaces })
      expect(visual.pulse).toBe(true)
      expect(visual.glow).not.toBeNull()
    }
  })

  it('never pulses or glows idle worktree nodes', () => {
    const visual = nodeVisual('worktree', 'idle', decorationsOf(), darkPalette)
    expect(visual.glow).toBeNull()
    expect(visual.pulse).toBe(false)
  })

  it('renders archived as a wireframe with no glow', () => {
    for (const kind of NODE_KINDS) {
      const visual = nodeVisual(kind, 'archived', decorationsOf(), darkPalette)
      expect(visual.surface).toEqual({
        kind: 'wireframe',
        stroke: darkPalette.archivedStroke,
        dash: [4, 3],
        opacity: 0.5
      })
      expect(visual.glow).toBeNull()
    }
  })

  // engine-blocked: no production path derives a 'spawning' node today — fixture only (NG-116)
  it('renders spawning as a wireframe with no glow (synthetic fixture)', () => {
    const visual = nodeVisual('worktree', 'spawning', decorationsOf(), darkPalette)
    expect(visual.surface).toEqual({
      kind: 'wireframe',
      stroke: darkPalette.spawningStroke,
      dash: [5, 4],
      opacity: 0.8
    })
    expect(visual.glow).toBeNull()
  })

  it('shows a selection ring unconditionally across every state and kind when selected', () => {
    for (const kind of NODE_KINDS) {
      for (const state of NODE_STATES) {
        const selected = nodeVisual(kind, state, decorationsOf({ selectionRing: true }), darkPalette)
        expect(selected.ring).toEqual({ color: darkPalette.accent, radius: SELECTION_RING_RADIUS })
        const unselected = nodeVisual(kind, state, decorationsOf({ selectionRing: false }), darkPalette)
        expect(unselected.ring).toBeNull()
      }
    }
  })

  it('shows an unread dot iff decorations.unreadDot is set', () => {
    const withDot = nodeVisual('worktree', 'unread', decorationsOf({ unreadDot: true }), darkPalette)
    expect(withDot.dot).not.toBeNull()
    const withoutDot = nodeVisual('worktree', 'unread', decorationsOf({ unreadDot: false }), darkPalette)
    expect(withoutDot.dot).toBeNull()
  })

  it('always colors the glow with the surface top face', () => {
    const glowing: Array<[NodeKind, NodeState]> = [
      ['root', 'idle'],
      ['worktree', 'working'],
      ['worktree', 'waiting-input']
    ]
    for (const [kind, state] of glowing) {
      const visual = nodeVisual(kind, state, decorationsOf(), darkPalette)
      if (visual.surface.kind !== 'solid' || visual.glow === null) throw new Error('expected a glowing solid fixture')
      expect(visual.glow.color).toBe(visual.surface.faces.top)
    }
  })

  it('holds under the light palette too', () => {
    const palette: ScenePalette = lightPalette
    const visual = nodeVisual('root', 'idle', decorationsOf(), palette)
    expect(visual.surface).toEqual({ kind: 'solid', faces: palette.rootFaces })
  })
})
