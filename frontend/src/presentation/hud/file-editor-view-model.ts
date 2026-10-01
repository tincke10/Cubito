import type { FileEditorView } from '../../application/file-editor-flow'

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
  message: string | null
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

const BADGES = { truncated: 'truncado, solo lectura', binary: 'binario, solo lectura' } as const

const CONFLICT_MESSAGES = {
  changed: 'el archivo cambió en disco desde que lo abriste',
  unverifiable: 'no se pudo verificar el archivo en disco'
} as const

/** Pure projection of the file view into panel copy (Spanish, like the rest of the HUD). */
export function fileEditorPanelModel(view: FileEditorView): FileEditorPanelModel {
  if (view.phase === 'closed') return HIDDEN
  const message =
    view.status === 'loading'
      ? 'cargando…'
      : view.error !== null
        ? view.error
        : view.readOnly === 'binary'
          ? 'archivo binario: no se puede mostrar'
          : null
  const readOnly = view.status !== 'ready' || view.readOnly !== null
  return {
    visible: true,
    title: view.path,
    text: view.content,
    badge: view.readOnly === null ? null : BADGES[view.readOnly],
    readOnly,
    dirty: view.dirty,
    saveEnabled: !readOnly && view.dirty && !view.saving && view.conflict === null,
    message,
    notice: view.notice,
    conflict:
      view.conflict === null
        ? null
        : {
            message: CONFLICT_MESSAGES[view.conflict.reason],
            reload: {
              idle: 'recargar',
              confirm: 'confirmar recargar (pierdes tus cambios)',
              busy: 'recargando…'
            },
            overwrite: {
              idle: 'sobrescribir',
              confirm: 'confirmar sobrescribir',
              busy: 'guardando…'
            },
            busy: view.saving || view.reloading
          },
    discard: view.confirmDiscard
      ? {
          message: 'hay cambios sin guardar',
          labels: { idle: 'descartar cambios', confirm: 'confirmar descartar', busy: '' }
        }
      : null
  }
}
