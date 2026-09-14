import { describe, expect, it } from 'vitest'
import {
  LABEL_CHAR_ADVANCE_PX,
  LABEL_LINE_HEIGHT_PX,
  LABEL_OFFSET_Y_PX,
  labelBoxPx,
  labelRectAt,
  resolveLabelCollisions
} from './label-collision-model'
import type { LabelCandidate, LabelRect } from './label-collision-model'
import type { NodeLabelModel } from './node-label-model'

const model = (overrides: Partial<NodeLabelModel> = {}): NodeLabelModel => ({
  primary: { text: 'feature-x', tone: 'primary' },
  secondary: null,
  callout: null,
  visible: true,
  ...overrides
})

describe('labelBoxPx', () => {
  it('is one line tall for primary only', () => {
    const box = labelBoxPx(model())
    expect(box.height).toBe(LABEL_LINE_HEIGHT_PX)
    expect(box.width).toBe('feature-x'.length * LABEL_CHAR_ADVANCE_PX)
  })

  it('is two lines tall with a secondary', () => {
    const box = labelBoxPx(model({ secondary: { text: 'agente · trabajando', tone: 'info' } }))
    expect(box.height).toBe(2 * LABEL_LINE_HEIGHT_PX)
  })

  it('is four lines tall with a callout (primary + secondary + 2 callout lines)', () => {
    const box = labelBoxPx(
      model({
        secondary: { text: 'agente · esperando input', tone: 'amber' },
        callout: {
          title: { text: 'esperando input', tone: 'amber' },
          hint: { text: 'revisá el agente para continuar', tone: 'amberDim' }
        }
      })
    )
    expect(box.height).toBe(4 * LABEL_LINE_HEIGHT_PX)
  })

  it('width tracks the LONGEST line, not the primary', () => {
    const box = labelBoxPx(
      model({
        callout: {
          title: { text: 'x', tone: 'amber' },
          hint: { text: 'revisá el agente para continuar', tone: 'amberDim' }
        }
      })
    )
    expect(box.width).toBe('revisá el agente para continuar'.length * LABEL_CHAR_ADVANCE_PX)
  })
})

describe('labelRectAt', () => {
  it('is centred on the anchor and dropped LABEL_OFFSET_Y_PX below it', () => {
    const rect = labelRectAt({ x: 100, y: 50, visible: true }, { width: 40, height: 20 })
    expect(rect.left).toBe(80)
    expect(rect.right).toBe(120)
    expect(rect.top).toBe(50 + LABEL_OFFSET_Y_PX)
    expect(rect.bottom).toBe(50 + LABEL_OFFSET_Y_PX + 20)
  })
})

const rect = (left: number, right: number): LabelRect => ({ left, top: 0, right, bottom: 10 })

const candidate = (id: string, priority: number, left: number, right: number): LabelCandidate => ({
  id,
  priority,
  rect: rect(left, right)
})

describe('resolveLabelCollisions', () => {
  it('hides nothing when boxes are disjoint', () => {
    const result = resolveLabelCollisions(
      [candidate('a', 1, 0, 100), candidate('b', 0, 200, 300)],
      new Set()
    )
    expect(result.size).toBe(0)
  })

  it('hides the lower-priority label of an overlapping pair', () => {
    const result = resolveLabelCollisions(
      [candidate('a', 1, 0, 100), candidate('b', 0, 50, 150)],
      new Set()
    )
    expect(result.has('b')).toBe(true)
    expect(result.has('a')).toBe(false)
  })

  it('a 3-way chain hides both losers, never the top-priority candidate', () => {
    // b (priority 2, the winner) overlaps both a and c; a and c do not overlap each other.
    const result = resolveLabelCollisions(
      [candidate('a', 1, 0, 100), candidate('b', 2, 80, 180), candidate('c', 0, 160, 260)],
      new Set()
    )
    expect(result.has('a')).toBe(true)
    expect(result.has('c')).toBe(true)
    expect(result.has('b')).toBe(false)
  })

  it('breaks a priority tie by id, not by array order', () => {
    const shuffledOrders = [
      [candidate('x', 1, 50, 150), candidate('y', 1, 0, 100)],
      [candidate('y', 1, 0, 100), candidate('x', 1, 50, 150)]
    ]
    for (const candidates of shuffledOrders) {
      const result = resolveLabelCollisions(candidates, new Set())
      expect(result.has('y')).toBe(true) // 'x' < 'y' lexicographically, so x wins
      expect(result.has('x')).toBe(false)
    }
  })

  it('the top-priority candidate is never hidden', () => {
    const result = resolveLabelCollisions(
      [candidate('top', 5, 0, 100), candidate('a', 1, 10, 90), candidate('b', 0, 20, 80)],
      new Set()
    )
    expect(result.has('top')).toBe(false)
  })

  it('hysteresis: a hidden label 3px clear of the winner stays hidden', () => {
    const result = resolveLabelCollisions(
      [candidate('top', 1, 0, 100), candidate('loser', 0, 103, 203)],
      new Set(['loser'])
    )
    expect(result.has('loser')).toBe(true)
  })

  it('hysteresis: a visible label overlapped by 3px stays visible', () => {
    const result = resolveLabelCollisions(
      [candidate('top', 1, 0, 100), candidate('other', 0, 97, 197)],
      new Set()
    )
    expect(result.has('other')).toBe(false)
  })

  it('hysteresis: a visible label overlapped by 6px is hidden', () => {
    const result = resolveLabelCollisions(
      [candidate('top', 1, 0, 100), candidate('other', 0, 94, 194)],
      new Set()
    )
    expect(result.has('other')).toBe(true)
  })
})
