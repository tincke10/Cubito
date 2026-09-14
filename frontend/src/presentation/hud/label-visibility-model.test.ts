import { describe, expect, it } from 'vitest'
import { labelPriorityAt, labelRenderOrder, labelVisibleAt } from './label-visibility-model'
import { LABEL_PRIORITY } from './label-visibility-model'
import type { NodeLabelRole } from './label-visibility-model'
import { CAMERA_HEIGHTS } from '../camera/camera-pose'
import type { CameraHeight } from '../camera/camera-pose'
import { NODE_STATES } from '../theme/node-state'
import type { NodeState } from '../theme/node-state'

const role = (overrides: Partial<NodeLabelRole> = {}): NodeLabelRole => ({
  isMain: false,
  isSelected: false,
  isChildOfAnchor: false,
  state: 'idle',
  ...overrides
})

/** design D12's 4×6 visibility table — one column per role, exactly as HGT/LBL spec it. */
const TABLE: Record<CameraHeight, Record<string, boolean>> = {
  general: {
    main: false,
    selected: false,
    working: false,
    waitingInput: false,
    childOfAnchor: false,
    other: false
  },
  isla: {
    main: true,
    selected: false,
    working: true,
    waitingInput: true,
    childOfAnchor: false,
    other: false
  },
  foco: {
    main: false,
    selected: true,
    working: false,
    waitingInput: false,
    childOfAnchor: false,
    other: false
  },
  comparar: {
    main: false,
    selected: false,
    working: false,
    waitingInput: false,
    childOfAnchor: true,
    other: false
  }
}

const roleFor = (column: string): NodeLabelRole => {
  switch (column) {
    case 'main':
      return role({ isMain: true })
    case 'selected':
      return role({ isSelected: true })
    case 'working':
      return role({ state: 'working' })
    case 'waitingInput':
      return role({ state: 'waiting-input' })
    case 'childOfAnchor':
      return role({ isChildOfAnchor: true })
    default:
      return role()
  }
}

describe('labelVisibleAt', () => {
  it.each(
    CAMERA_HEIGHTS.flatMap((height) =>
      Object.entries(TABLE[height]).map(([column, expected]) => [height, column, expected] as const)
    )
  )('height=%s column=%s -> %s', (height, column, expected) => {
    expect(labelVisibleAt(height, roleFor(column))).toBe(expected)
  })

  it('general hides every label regardless of role combination', () => {
    for (const state of NODE_STATES) {
      expect(labelVisibleAt('general', role({ isMain: true, isSelected: true, state }))).toBe(false)
    }
  })

  it('isla shows main, working and waiting-input but never the mere selection', () => {
    expect(labelVisibleAt('isla', role({ isMain: true }))).toBe(true)
    expect(labelVisibleAt('isla', role({ state: 'working' }))).toBe(true)
    expect(labelVisibleAt('isla', role({ state: 'waiting-input' }))).toBe(true)
    expect(labelVisibleAt('isla', role({ isSelected: true }))).toBe(false)
  })

  it('foco shows only the selected node even when it is also main', () => {
    expect(labelVisibleAt('foco', role({ isSelected: true, isMain: true }))).toBe(true)
    expect(labelVisibleAt('foco', role({ isMain: true, state: 'working' }))).toBe(false)
  })

  it("comparar shows only the anchor's children (the camada parent, or every main when absent)", () => {
    expect(labelVisibleAt('comparar', role({ isChildOfAnchor: true }))).toBe(true)
    expect(labelVisibleAt('comparar', role({ isMain: true, isSelected: true }))).toBe(false)
  })

  it('no other height reads isChildOfAnchor', () => {
    const anchored = role({ isChildOfAnchor: true })
    expect(labelVisibleAt('general', anchored)).toBe(false)
    expect(labelVisibleAt('isla', anchored)).toBe(false)
    expect(labelVisibleAt('foco', anchored)).toBe(false)
  })

  it('a node matching any applicable column is visible (OR over matching roles)', () => {
    const bothMainAndWorking: NodeState = 'working'
    expect(labelVisibleAt('isla', role({ isMain: true, state: bothMainAndWorking }))).toBe(true)
  })
})

describe('labelPriorityAt', () => {
  it('ranks selected > waiting-input > working > main > rest', () => {
    expect(labelPriorityAt(role({ isSelected: true }))).toBe(LABEL_PRIORITY.selected)
    expect(labelPriorityAt(role({ state: 'waiting-input' }))).toBe(LABEL_PRIORITY.waitingInput)
    expect(labelPriorityAt(role({ state: 'working' }))).toBe(LABEL_PRIORITY.working)
    expect(labelPriorityAt(role({ isMain: true }))).toBe(LABEL_PRIORITY.main)
    expect(labelPriorityAt(role())).toBe(LABEL_PRIORITY.rest)
  })

  it('a node that is both main and waiting-input takes the higher rank', () => {
    expect(labelPriorityAt(role({ isMain: true, state: 'waiting-input' }))).toBe(
      LABEL_PRIORITY.waitingInput
    )
  })
})

describe('labelRenderOrder', () => {
  it('is strictly negative for every priority, so terminal/spawn panels at 0 always win', () => {
    for (const priority of Object.values(LABEL_PRIORITY)) {
      expect(labelRenderOrder(priority)).toBeLessThan(0)
    }
  })

  it('is strictly increasing in priority', () => {
    const ordered = Object.values(LABEL_PRIORITY).sort((a, b) => a - b)
    for (let i = 1; i < ordered.length; i++) {
      expect(labelRenderOrder(ordered[i]!)).toBeGreaterThan(labelRenderOrder(ordered[i - 1]!))
    }
  })
})
