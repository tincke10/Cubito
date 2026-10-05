import { enPalette } from './palette'
import { enNotifications } from './notifications'
import { enHud } from './hud'
import { enKeys } from './keys'
import { enSpawn } from './spawn'
import { enProjects } from './projects'
import { enTerminal } from './terminal'
import { enDelete } from './delete'
import { enConnection } from './connection'
import { enFanout } from './fanout'
import { enEditor } from './editor'
import { enQuickopen } from './quickopen'
import { enDiff } from './diff'
import { enCompare } from './compare'
import { enSourcecontrol } from './sourcecontrol'
import { enReview } from './review'
import { enSystem } from './system'
import { enActivity } from './activity'
import { enFailure } from './failure'

/** English is the source of truth for message keys; es must mirror it (see es/index.ts). */
export const en = {
  ...enPalette,
  ...enNotifications,
  ...enHud,
  ...enKeys,
  ...enSpawn,
  ...enProjects,
  ...enTerminal,
  ...enDelete,
  ...enConnection,
  ...enFanout,
  ...enEditor,
  ...enQuickopen,
  ...enDiff,
  ...enCompare,
  ...enSourcecontrol,
  ...enReview,
  ...enSystem,
  ...enActivity,
  ...enFailure
} as const

export type MessageKey = keyof typeof en
