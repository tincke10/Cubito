import type { FileEditorView } from '../../application/file-editor-flow'

export type FileEditorPanelModel = {
  visible: boolean
  title: string
  text: string
  /** Why the pane cannot be edited, shown next to the title. */
  badge: string | null
  readOnly: boolean
  /** Status line below the text: loading, a read error or the binary notice. */
  message: string | null
}

const HIDDEN: FileEditorPanelModel = {
  visible: false,
  title: '',
  text: '',
  badge: null,
  readOnly: true,
  message: null
}

const BADGES = { truncated: 'truncado, solo lectura', binary: 'binario, solo lectura' } as const

/** Pure projection of the file view into panel copy (Spanish, like the rest of the HUD). */
export function fileEditorPanelModel(view: FileEditorView): FileEditorPanelModel {
  if (view.phase === 'closed') return HIDDEN
  const message =
    view.status === 'loading'
      ? 'cargando…'
      : view.status === 'error'
        ? (view.error ?? 'no se pudo leer el archivo')
        : view.readOnly === 'binary'
          ? 'archivo binario: no se puede mostrar'
          : null
  return {
    visible: true,
    title: view.path,
    text: view.content,
    badge: view.readOnly === null ? null : BADGES[view.readOnly],
    readOnly: view.status !== 'ready' || view.readOnly !== null,
    message
  }
}
