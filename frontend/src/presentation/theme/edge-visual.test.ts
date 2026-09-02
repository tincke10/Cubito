import { describe, expect, it } from 'vitest'
import { edgeVisual, flowDashOffset } from './edge-visual'
import { NODE_STATES } from './node-state'
import { darkPalette } from './scene-palette'
import { FLOW_DASH, FLOW_GAP, FAINT_DASH, FAINT_GAP, FLOW_PERIOD_SECONDS } from './scene-metrics'

describe('edgeVisual', () => {
  it('never throws across the full NodeState × NodeState cross product', () => {
    for (const from of NODE_STATES) {
      for (const to of NODE_STATES) {
        expect(() => edgeVisual(from, to, darkPalette)).not.toThrow()
      }
    }
  })

  it('flows whenever the target node is working or waiting-input, even from an archived source', () => {
    for (const toState of ['working', 'waiting-input'] as const) {
      for (const fromState of NODE_STATES) {
        const visual = edgeVisual(fromState, toState, darkPalette)
        expect(visual).toEqual({
          color: darkPalette.edgeFlow,
          opacity: 0.5,
          width: 1.5,
          dash: { size: FLOW_DASH, gap: FLOW_GAP },
          flowing: true
        })
      }
    }
  })

  it('goes faint when neither endpoint flows but either endpoint is archived', () => {
    const fromArchived = edgeVisual('archived', 'idle', darkPalette)
    expect(fromArchived).toEqual({
      color: darkPalette.edgeFaint,
      opacity: 0.35,
      width: 1.0,
      dash: { size: FAINT_DASH, gap: FAINT_GAP },
      flowing: false
    })
    const toArchived = edgeVisual('idle', 'archived', darkPalette)
    expect(toArchived.color).toBe(darkPalette.edgeFaint)
    expect(toArchived.flowing).toBe(false)
  })

  it('is solid when neither the flow nor the faint condition holds', () => {
    const visual = edgeVisual('idle', 'dirty', darkPalette)
    expect(visual).toEqual({
      color: darkPalette.edgeNormal,
      opacity: 0.8,
      width: 1.5,
      dash: null,
      flowing: false
    })
  })
})

describe('flowDashOffset', () => {
  it('is zero at the start of the clock', () => {
    expect(flowDashOffset(0)).toBeCloseTo(0, 10)
  })

  it('marches in the negative direction (parent→child) as elapsed time increases', () => {
    const early = flowDashOffset(0.1)
    const later = flowDashOffset(0.5)
    expect(early).toBeLessThan(0)
    expect(later).toBeLessThan(early)
  })

  it('wraps deterministically at the period boundary, matching a fixed formula', () => {
    const cycleLength = FLOW_DASH + FLOW_GAP
    const withinCycle = flowDashOffset(0.3)
    const expected = -((0.3 % FLOW_PERIOD_SECONDS) / FLOW_PERIOD_SECONDS) * 2 * cycleLength
    expect(withinCycle).toBeCloseTo(expected, 10)
    // one full period back to the same phase — no per-object state, pure function of elapsed
    expect(flowDashOffset(0.3)).toBeCloseTo(flowDashOffset(0.3 + FLOW_PERIOD_SECONDS), 10)
  })
})
