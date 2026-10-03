import type { enActivity } from '../en/activity'

export const esActivity: Record<keyof typeof enActivity, string> = {
  'activity.read': 'leyó',
  'activity.edit': 'editando',
  'activity.create': 'nuevo',
  'activity.run': 'corrió'
}
