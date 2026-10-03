import { t, tn } from '../../application/i18n/translate'
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

/** Pure projection of the delete flow into panel copy (Spanish, like the rest of the HUD). */
export function worktreeDeletePanelModel(view: WorktreeDeleteView): WorktreeDeletePanelModel {
  if (view.phase === 'idle') return HIDDEN
  if (view.blocked) {
    return {
      ...HIDDEN,
      visible: true,
      title: t('delete.blockedTitle', { branch: view.branch }),
      lines: [t('delete.blockedLine')]
    }
  }
  const lines: string[] = []
  if (view.dirtyFiles === 'loading') lines.push(t('delete.loading'))
  else if (view.dirtyFiles === 'unknown') lines.push(t('delete.unknown'))
  else if (view.dirtyFiles > 0) lines.push(tn('delete.dirty', view.dirtyFiles))
  else lines.push(t('delete.clean'))
  if (view.liveTerminals > 0) lines.push(tn('delete.terminals', view.liveTerminals))
  if (
    view.agentStatus === 'working' ||
    view.agentStatus === 'blocked' ||
    view.agentStatus === 'waiting-input'
  )
    lines.push(t('delete.agentActive', { status: view.agentStatus }))
  if (view.children.length > 0)
    lines.push(tn('delete.children', view.children.length, { names: view.children.join(', ') }))
  return {
    visible: true,
    title: t('delete.title', { branch: view.branch }),
    lines,
    error: view.error,
    showAction: true,
    actionLabels: view.forceOffered
      ? { idle: t('delete.force'), confirm: t('delete.confirmForce'), busy: t('delete.busy') }
      : { idle: t('delete.action'), confirm: t('delete.confirm'), busy: t('delete.busy') },
    busy: view.removing,
    cancelDisabled: view.removing
  }
}
