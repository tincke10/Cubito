import { plainFailure } from '../../application/i18n/user-facing-error'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fileEditorPanelModel } from './file-editor-view-model'
import type { FileEditorView } from '../../application/file-editor-flow'
import { setActiveLanguage } from '../../application/i18n/translate'

const open = (over: Partial<Extract<FileEditorView, { phase: 'open' }>> = {}): FileEditorView => ({
  phase: 'open',
  nodeId: 'w',
  path: 'a.ts',
  status: 'ready',
  content: 'x',
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

describe('fileEditorPanelModel (en)', () => {
  beforeEach(() => setActiveLanguage('en'))
  afterEach(() => setActiveLanguage('es'))

  it('words status, badge, conflict and discard copy in English', () => {
    expect(fileEditorPanelModel(open({ status: 'loading' })).message).toEqual(
      plainFailure('loading…')
    )
    const binary = fileEditorPanelModel(open({ readOnly: 'binary' }))
    expect(binary.badge).toBe('binary, read-only')
    expect(binary.message).toEqual(plainFailure('binary file: cannot be displayed'))
    const conflict = fileEditorPanelModel(open({ conflict: { reason: 'changed' } })).conflict
    expect(conflict?.message).toBe('the file changed on disk since you opened it')
    expect(conflict?.overwrite.idle).toBe('overwrite')
    expect(fileEditorPanelModel(open({ confirmDiscard: true })).discard?.message).toBe(
      'you have unsaved changes'
    )
  })
})
