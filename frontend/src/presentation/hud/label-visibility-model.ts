import type { CameraHeight } from '../camera/camera-pose'
import type { NodeState } from '../theme/node-state'

export type NodeLabelRole = {
  readonly isMain: boolean
  readonly isSelected: boolean
  readonly isChildOfMain: boolean
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
      return role.isChildOfMain
  }
}
