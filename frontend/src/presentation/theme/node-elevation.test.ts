import { describe, expect, it } from 'vitest'
import { elevationFor } from './node-elevation'
import { NODE_STATES } from './node-state'
import type { NodeState } from './node-state'
import { ROOT_MIN_ELEVATION } from './scene-metrics'

const nonArchivedStates: readonly NodeState[] = NODE_STATES.filter((s) => s !== 'archived')

describe('elevationFor', () => {
  it('gives waiting-input the highest elevation of any worktree state', () => {
    const waitingHeight = elevationFor('waiting-input', 'worktree').height
    for (const state of NODE_STATES) {
      expect(waitingHeight).toBeGreaterThanOrEqual(elevationFor(state, 'worktree').height)
    }
  })

  it('orders worktree states waiting-input > working > dirty === unread > spawning > idle > archived', () => {
    const h = (state: NodeState): number => elevationFor(state, 'worktree').height
    expect(h('waiting-input')).toBeGreaterThan(h('working'))
    expect(h('working')).toBeGreaterThan(h('dirty'))
    expect(h('dirty')).toBe(h('unread'))
    expect(h('dirty')).toBeGreaterThan(h('spawning'))
    expect(h('spawning')).toBeGreaterThan(h('idle'))
    expect(h('idle')).toBeGreaterThan(h('archived'))
  })

  it('grounds worktree-kind archived nodes with no shadow', () => {
    expect(elevationFor('archived', 'worktree')).toEqual({ height: 0, shadow: null })
  })

  it('is the only worktree state with a null shadow', () => {
    for (const state of nonArchivedStates) {
      expect(elevationFor(state, 'worktree').shadow).not.toBeNull()
    }
  })

  it('floats idle worktree nodes at 0.20 with a shadow', () => {
    const idle = elevationFor('idle', 'worktree')
    expect(idle.height).toBe(0.2)
    expect(idle.shadow).not.toBeNull()
  })

  it('floors the root at ROOT_MIN_ELEVATION even when its state would sit lower', () => {
    expect(elevationFor('idle', 'root').height).toBe(ROOT_MIN_ELEVATION)
    expect(ROOT_MIN_ELEVATION).toBe(0.48)
  })

  // Root is "the scene's anchor: it never sits fully down" (design §2.2) — the floor applies
  // uniformly per the Math.max(ELEVATION[state], ROOT_MIN_ELEVATION) formula (design §5.2),
  // even for archived, since no mockup measurement exists for an archived root to override it.
  // A root's shadow stays null for archived regardless, since shadow===null is keyed on state alone.
  it('still nulls the shadow for an archived root, but raises its height to the floor', () => {
    const archivedRoot = elevationFor('archived', 'root')
    expect(archivedRoot.shadow).toBeNull()
    expect(archivedRoot.height).toBe(ROOT_MIN_ELEVATION)
  })

  // engine-blocked: no production path derives a 'spawning' node today — fixture only (NG-144)
  it('keeps spawning nodes floating with a shadow (synthetic fixture)', () => {
    expect(elevationFor('spawning', 'worktree').shadow).not.toBeNull()
  })

  it('increases shadow radius and opacity monotonically with height, worktree kind', () => {
    const byHeight = [...nonArchivedStates]
      .map((state) => elevationFor(state, 'worktree'))
      .sort((a, b) => a.height - b.height)
    for (let i = 1; i < byHeight.length; i += 1) {
      const prev = byHeight[i - 1]?.shadow
      const curr = byHeight[i]?.shadow
      if (prev === undefined || curr === undefined || prev === null || curr === null) continue
      expect(curr.radius).toBeGreaterThanOrEqual(prev.radius)
      expect(curr.opacity).toBeGreaterThanOrEqual(prev.opacity)
    }
  })

  it('never throws across the full NodeKind × NodeState cross product', () => {
    for (const kind of ['root', 'worktree'] as const) {
      for (const state of NODE_STATES) {
        expect(() => elevationFor(state, kind)).not.toThrow()
      }
    }
  })
})
