import type { enNotifications } from '../en/notifications'

export const esNotifications: Record<keyof typeof enNotifications, string> = {
  'notifications.finished': '{context} - {agent} terminó',
  'notifications.needsInput': '{context} - {agent} necesita tu respuesta'
}
