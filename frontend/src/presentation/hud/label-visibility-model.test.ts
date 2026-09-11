import { describe, expect, it } from 'vitest'
import { labelVisibleAt } from './label-visibility-model'
import type { NodeLabelRole } from './label-visibility-model'
import { CAMERA_HEIGHTS } from '../camera/camera-pose'
import type { CameraHeight } from '../camera/camera-pose'
import { NODE_STATES } from '../theme/node-state'
import type { NodeState } from '../theme/node-state'

const role = (overrides: Partial<NodeLabelRole> = {}): NodeLabelRole => ({
  isMain: false,
  isSelected: false,
  isChildOfMain: false,
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
    childOfMain: false,
    other: false
  },
  isla: {
    main: true,
    selected: false,
    working: true,
    waitingInput: true,
    childOfMain: false,
    other: false
  },
  foco: {
    main: false,
    selected: true,
    working: false,
    waitingInput: false,
    childOfMain: false,
    other: false
  },
  comparar: {
    main: false,
    selected: false,
    working: false,
    waitingInput: false,
    childOfMain: true,
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
    case 'childOfMain':
      return role({ isChildOfMain: true })
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

  it('comparar shows only the children of main', () => {
    expect(labelVisibleAt('comparar', role({ isChildOfMain: true }))).toBe(true)
    expect(labelVisibleAt('comparar', role({ isMain: true, isSelected: true }))).toBe(false)
  })

  it('a node matching any applicable column is visible (OR over matching roles)', () => {
    const bothMainAndWorking: NodeState = 'working'
    expect(labelVisibleAt('isla', role({ isMain: true, state: bothMainAndWorking }))).toBe(true)
  })
})
