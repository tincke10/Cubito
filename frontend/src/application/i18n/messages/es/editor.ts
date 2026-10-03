import type { enEditor } from '../en/editor'

export const esEditor: Record<keyof typeof enEditor, string> = {
  'editor.badgeTruncated': 'truncado, solo lectura',
  'editor.badgeBinary': 'binario, solo lectura',
  'editor.conflictChanged': 'el archivo cambió en disco desde que lo abriste',
  'editor.conflictUnverifiable': 'no se pudo verificar el archivo en disco',
  'editor.loading': 'cargando…',
  'editor.binaryNotice': 'archivo binario: no se puede mostrar',
  'editor.reload': 'recargar',
  'editor.reloadConfirm': 'confirmar recargar (perdés tus cambios)',
  'editor.reloadBusy': 'recargando…',
  'editor.overwrite': 'sobrescribir',
  'editor.overwriteConfirm': 'confirmar sobrescribir',
  'editor.overwriteBusy': 'guardando…',
  'editor.discardMessage': 'hay cambios sin guardar',
  'editor.discard': 'descartar cambios',
  'editor.discardConfirm': 'confirmar descartar',
  'editor.saveFailed': 'no se pudo guardar: {reason}',
  'editor.saved': 'guardado',
  'editor.unsavedMark': 'cambios sin guardar',
  'editor.save': 'guardar',
  'editor.close': 'cerrar',
  'editor.keepEditing': 'seguir editando'
}
