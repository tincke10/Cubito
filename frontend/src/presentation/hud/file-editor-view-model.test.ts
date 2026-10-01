import { describe, expect, it } from 'vitest'
import { fileEditorPanelModel } from './file-editor-view-model'
import type { FileEditorView } from '../../application/file-editor-flow'

const view = (over: Partial<Extract<FileEditorView, { phase: 'open' }>> = {}): FileEditorView => ({
  phase: 'open',
  nodeId: 'w',
  path: 'src/a.ts',
  status: 'ready',
  content: 'hello',
  readOnly: null,
  dirty: false,
  saving: false,
  reloading: false,
  notice: null,
  error: null,
  conflict: null,
  confirmDiscard: false,
  ...over
})

describe('fileEditorPanelModel', () => {
  it('is hidden while closed', () => {
    expect(fileEditorPanelModel({ phase: 'closed' }).visible).toBe(false)
  })

  it('shows the path and text of a ready file', () => {
    expect(fileEditorPanelModel(view())).toMatchObject({
      visible: true,
      title: 'src/a.ts',
      text: 'hello',
      badge: null,
      message: null
    })
  })

  it('says it is loading', () => {
    expect(fileEditorPanelModel(view({ status: 'loading', content: '' })).message).toBe('cargando…')
  })

  it('makes a truncated file visibly read-only', () => {
    expect(fileEditorPanelModel(view({ readOnly: 'truncated' }))).toMatchObject({
      badge: 'truncado, solo lectura',
      readOnly: true
    })
  })

  it('explains a binary file instead of showing bytes', () => {
    expect(fileEditorPanelModel(view({ readOnly: 'binary', content: '' }))).toMatchObject({
      badge: 'binario, solo lectura',
      readOnly: true,
      message: 'archivo binario: no se puede mostrar'
    })
  })

  it('surfaces a read error and keeps the pane read-only', () => {
    expect(fileEditorPanelModel(view({ status: 'error', error: 'ENOENT' }))).toMatchObject({
      message: 'ENOENT',
      readOnly: true
    })
  })

  it('marks unsaved edits and enables save only when there is something to save', () => {
    expect(fileEditorPanelModel(view({ dirty: true }))).toMatchObject({
      dirty: true,
      saveEnabled: true
    })
    expect(fileEditorPanelModel(view())).toMatchObject({ dirty: false, saveEnabled: false })
    expect(fileEditorPanelModel(view({ dirty: true, saving: true })).saveEnabled).toBe(false)
    expect(fileEditorPanelModel(view({ dirty: true, readOnly: 'truncated' })).saveEnabled).toBe(
      false
    )
  })

  it('shows a saved notice and a save error under the text', () => {
    expect(fileEditorPanelModel(view({ notice: 'guardado' })).notice).toBe('guardado')
    expect(
      fileEditorPanelModel(view({ dirty: true, error: 'no se pudo guardar: EACCES' }))
    ).toMatchObject({
      message: 'no se pudo guardar: EACCES'
    })
  })

  it('offers reload and overwrite through two-step labels when the file changed', () => {
    const model = fileEditorPanelModel(view({ dirty: true, conflict: { reason: 'changed' } }))
    expect(model.conflict).toMatchObject({
      message: 'el archivo cambió en disco desde que lo abriste',
      reload: { idle: 'recargar', confirm: 'confirmar recargar (pierdes tus cambios)' },
      overwrite: { idle: 'sobrescribir', confirm: 'confirmar sobrescribir' },
      busy: false
    })
    expect(model.saveEnabled).toBe(false)
  })

  it('words an unverifiable conflict differently and is busy while saving or reloading', () => {
    const model = fileEditorPanelModel(
      view({ dirty: true, conflict: { reason: 'unverifiable' }, reloading: true })
    )
    expect(model.conflict?.message).toBe('no se pudo verificar el archivo en disco')
    expect(model.conflict?.busy).toBe(true)
  })

  it('asks to discard unsaved changes on close', () => {
    expect(fileEditorPanelModel(view({ dirty: true, confirmDiscard: true })).discard).toMatchObject(
      {
        message: 'hay cambios sin guardar',
        labels: { idle: 'descartar cambios', confirm: 'confirmar descartar' }
      }
    )
    expect(fileEditorPanelModel(view({ dirty: true })).discard).toBeNull()
  })
})
