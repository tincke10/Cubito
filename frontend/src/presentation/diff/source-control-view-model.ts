import type { SourceControlView } from '../../application/source-control-flow'

export type SourceControlModel = {
  visible: boolean
  statusLine: string
  message: string
  commitLabel: string
  commitDisabled: boolean
  pushLabel: string
  pushDisabled: boolean
  messageDisabled: boolean
  notice: { tone: 'ok' | 'error'; text: string } | null
}

const HIDDEN: SourceControlModel = {
  visible: false,
  statusLine: '',
  message: '',
  commitLabel: 'commit',
  commitDisabled: true,
  pushLabel: 'push',
  pushDisabled: true,
  messageDisabled: true,
  notice: null
}

/** Pure projection of the source-control flow into composer copy (Spanish, like the HUD). */
export function sourceControlModel(view: SourceControlView): SourceControlModel {
  if (view.phase === 'hidden') return HIDDEN
  const sync = view.hasUpstream ? `↑${view.ahead} ↓${view.behind}` : 'sin upstream'
  return {
    visible: true,
    statusLine: `${view.stagedCount} en stage · ${sync}`,
    message: view.message,
    commitLabel: view.busy === 'commit' ? 'commiteando…' : 'commit',
    commitDisabled: !view.canCommit,
    pushLabel: view.busy === 'push' ? 'pusheando…' : view.hasUpstream ? 'push' : 'publicar rama',
    pushDisabled: !view.canPush,
    messageDisabled: view.busy !== null,
    notice: view.notice
  }
}
