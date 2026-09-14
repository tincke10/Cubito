import type { CameraHeight } from '../camera/camera-pose'
import type { NodeState } from '../theme/node-state'

export type NodeLabelRole = {
  readonly isMain: boolean
  readonly isSelected: boolean
  /** Child of the comparar label anchor — the camada parent while comparing, else any main
   *  node (design compare-side-panel §1.4/W4). */
  readonly isChildOfAnchor: boolean
  readonly state: NodeState
}

/** Design D12's 4×6 table: visible iff the height's own column matches ANY applicable role. */
export function labelVisibleAt(height: CameraHeight, role: NodeLabelRole): boolean {
  switch (height) {
    case 'general':
      return false
    case 'isla':
      return role.isMain || role.state === 'working' || role.state === 'waiting-input'
    case 'foco':
      return role.isSelected
    case 'comparar':
      return role.isChildOfAnchor
  }
}

/** Rank shared by paint order and collision survival (design D2/D3): selected > waiting-input > working > main > rest. */
export const LABEL_PRIORITY = {
  selected: 4,
  waitingInput: 3,
  working: 2,
  main: 1,
  rest: 0
} as const

export function labelPriorityAt(role: NodeLabelRole): number {
  if (role.isSelected) return LABEL_PRIORITY.selected
  if (role.state === 'waiting-input') return LABEL_PRIORITY.waitingInput
  if (role.state === 'working') return LABEL_PRIORITY.working
  if (role.isMain) return LABEL_PRIORITY.main
  return LABEL_PRIORITY.rest
}

/** Negative band: node labels always paint under the terminal/spawn CSS2D panels at renderOrder 0. */
const LABEL_RENDER_ORDER_FLOOR = -10
export function labelRenderOrder(priority: number): number {
  return LABEL_RENDER_ORDER_FLOOR + priority
}
