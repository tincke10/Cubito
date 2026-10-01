import type { WorktreeDeleteView } from '../../application/worktree-delete-flow'

export type WorktreeDeletePanelModel = {
  visible: boolean
  title: string
  lines: readonly string[]
  error: string | null
  /** Hidden for the primary worktree: there is nothing to confirm. */
  showAction: boolean
  actionLabels: { idle: string; confirm: string; busy: string }
  busy: boolean
  cancelDisabled: boolean
}

const HIDDEN: WorktreeDeletePanelModel = {
  visible: false,
  title: '',
  lines: [],
  error: null,
  showAction: false,
  actionLabels: { idle: '', confirm: '', busy: '' },
  busy: false,
  cancelDisabled: false
}

const plural = (count: number, one: string, many: string): string =>
  `${count} ${count === 1 ? one : many}`

/** Pure projection of the delete flow into panel copy (Spanish, like the rest of the HUD). */
export function worktreeDeletePanelModel(view: WorktreeDeleteView): WorktreeDeletePanelModel {
  if (view.phase === 'idle') return HIDDEN
  if (view.blocked) {
    return {
      ...HIDDEN,
      visible: true,
      title: `${view.branch} es el worktree principal`,
      lines: ['El worktree principal del repo no se puede eliminar.']
    }
  }
  const lines: string[] = []
  if (view.dirtyFiles === 'loading') lines.push('revisando cambios sin commitear…')
  else if (view.dirtyFiles === 'unknown')
    lines.push('no se pudo leer el estado git: puede haber cambios')
  else if (view.dirtyFiles > 0)
    lines.push(
      `${plural(view.dirtyFiles, 'archivo con cambios', 'archivos con cambios')} sin commitear`
    )
  else lines.push('sin cambios sin commitear')
  if (view.liveTerminals > 0)
    lines.push(`${plural(view.liveTerminals, 'terminal viva', 'terminales vivas')} se van a cerrar`)
  if (
    view.agentStatus === 'working' ||
    view.agentStatus === 'blocked' ||
    view.agentStatus === 'waiting-input'
  )
    lines.push(`hay un agente activo (${view.agentStatus})`)
  if (view.children.length > 0)
    lines.push(
      `tiene ${plural(view.children.length, 'worktree hijo', 'worktrees hijos')}: ${view.children.join(', ')}`
    )
  return {
    visible: true,
    title: `Eliminar ${view.branch}`,
    lines,
    error: view.error,
    showAction: true,
    actionLabels: view.forceOffered
      ? { idle: 'forzar eliminación', confirm: 'confirmar forzar', busy: 'eliminando…' }
      : { idle: 'eliminar', confirm: 'confirmar eliminación', busy: 'eliminando…' },
    busy: view.removing,
    cancelDisabled: view.removing
  }
}
