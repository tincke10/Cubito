import { plainFailure } from '../../application/i18n/user-facing-error'
import type { FailureMessage } from '../../application/i18n/user-facing-error'
import type { FileEditorView } from '../../application/file-editor-flow'
import { t } from '../../application/i18n/translate'

type TwoStepLabels = { idle: string; confirm: string; busy: string }

export type FileEditorPanelModel = {
  visible: boolean
  title: string
  text: string
  /** Why the pane cannot be edited, shown next to the title. */
  badge: string | null
  readOnly: boolean
  /** Unsaved-edits marker next to the title. */
  dirty: boolean
  saveEnabled: boolean
  /** Status line below the text: loading, a read/save error or the binary notice. */
  message: FailureMessage | null
  notice: string | null
  conflict: {
    message: string
    reload: TwoStepLabels
    overwrite: TwoStepLabels
    busy: boolean
  } | null
  discard: { message: string; labels: TwoStepLabels } | null
}

const HIDDEN: FileEditorPanelModel = {
  visible: false,
  title: '',
  text: '',
  badge: null,
  readOnly: true,
  dirty: false,
  saveEnabled: false,
  message: null,
  notice: null,
  conflict: null,
  discard: null
}

const badgeOf = (reason: 'truncated' | 'binary'): string =>
  t(reason === 'truncated' ? 'editor.badgeTruncated' : 'editor.badgeBinary')

const conflictMessageOf = (reason: 'changed' | 'unverifiable'): string =>
  t(reason === 'changed' ? 'editor.conflictChanged' : 'editor.conflictUnverifiable')

/** Pure projection of the file view into panel copy (localized via t()). */
export function fileEditorPanelModel(view: FileEditorView): FileEditorPanelModel {
  if (view.phase === 'closed') return HIDDEN
  const message =
    view.status === 'loading'
      ? plainFailure(t('editor.loading'))
      : view.error !== null
        ? view.error
        : view.readOnly === 'binary'
          ? plainFailure(t('editor.binaryNotice'))
          : null
  const readOnly = view.status !== 'ready' || view.readOnly !== null
  return {
    visible: true,
    title: view.path,
    text: view.content,
    badge: view.readOnly === null ? null : badgeOf(view.readOnly),
    readOnly,
    dirty: view.dirty,
    saveEnabled: !readOnly && view.dirty && !view.saving && view.conflict === null,
    message,
    notice: view.notice,
    conflict:
      view.conflict === null
        ? null
        : {
            message: conflictMessageOf(view.conflict.reason),
            reload: {
              idle: t('editor.reload'),
              confirm: t('editor.reloadConfirm'),
              busy: t('editor.reloadBusy')
            },
            overwrite: {
              idle: t('editor.overwrite'),
              confirm: t('editor.overwriteConfirm'),
              busy: t('editor.overwriteBusy')
            },
            busy: view.saving || view.reloading
          },
    discard: view.confirmDiscard
      ? {
          message: t('editor.discardMessage'),
          labels: { idle: t('editor.discard'), confirm: t('editor.discardConfirm'), busy: '' }
        }
      : null
  }
}
