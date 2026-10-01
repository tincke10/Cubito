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
  error: null,
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
})
