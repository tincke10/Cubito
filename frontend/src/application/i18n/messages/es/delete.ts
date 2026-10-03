import type { enDelete } from '../en/delete'

export const esDelete: Record<keyof typeof enDelete, string> = {
  'delete.blockedTitle': '{branch} es el worktree principal',
  'delete.blockedLine': 'El worktree principal del repo no se puede eliminar.',
  'delete.loading': 'revisando cambios sin commitear…',
  'delete.unknown': 'no se pudo leer el estado git: puede haber cambios',
  'delete.dirtyOne': '{count} archivo con cambios sin commitear',
  'delete.dirtyMany': '{count} archivos con cambios sin commitear',
  'delete.clean': 'sin cambios sin commitear',
  'delete.terminalsOne': '{count} terminal viva se van a cerrar',
  'delete.terminalsMany': '{count} terminales vivas se van a cerrar',
  'delete.agentActive': 'hay un agente activo ({status})',
  'delete.childrenOne': 'tiene {count} worktree hijo: {names}',
  'delete.childrenMany': 'tiene {count} worktrees hijos: {names}',
  'delete.title': 'Eliminar {branch}',
  'delete.force': 'forzar eliminación',
  'delete.confirmForce': 'confirmar forzar',
  'delete.busy': 'eliminando…',
  'delete.action': 'eliminar',
  'delete.confirm': 'confirmar eliminación',
  'delete.cancel': 'cancelar'
}
