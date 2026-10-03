import type { MessageKey } from '../en'
import { esPalette } from './palette'
import { esNotifications } from './notifications'
import { esHud } from './hud'
import { esKeys } from './keys'
import { esSpawn } from './spawn'
import { esProjects } from './projects'
import { esTerminal } from './terminal'
import { esDelete } from './delete'
import { esConnection } from './connection'
import { esFanout } from './fanout'
import { esEditor } from './editor'
import { esQuickopen } from './quickopen'
import { esDiff } from './diff'
import { esCompare } from './compare'
import { esSourcecontrol } from './sourcecontrol'
import { esReview } from './review'
import { esSystem } from './system'
import { esActivity } from './activity'

export const es: Record<MessageKey, string> = {
  ...esPalette,
  ...esNotifications,
  ...esHud,
  ...esKeys,
  ...esSpawn,
  ...esProjects,
  ...esTerminal,
  ...esDelete,
  ...esConnection,
  ...esFanout,
  ...esEditor,
  ...esQuickopen,
  ...esDiff,
  ...esCompare,
  ...esSourcecontrol,
  ...esReview,
  ...esSystem,
  ...esActivity
}
