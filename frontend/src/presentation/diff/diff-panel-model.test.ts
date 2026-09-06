import { describe, expect, it } from 'vitest'
import { diffPanelViewModel } from './diff-panel-model'
import type { DiffPanelState } from '../../application/diff-view-model'

describe('diffPanelViewModel', () => {
  it('maps idle to { kind: "idle" }', () => {
    expect(diffPanelViewModel({ kind: 'idle' })).toEqual({ kind: 'idle' })
  })

  it('maps loading to { kind: "loading" }', () => {
    expect(diffPanelViewModel({ kind: 'loading' })).toEqual({ kind: 'loading' })
  })

  it('maps error with a message through', () => {
    expect(diffPanelViewModel({ kind: 'error', message: 'boom' })).toEqual({
      kind: 'error',
      message: 'boom'
    })
  })

  it('maps error without a message to a bare error', () => {
    expect(diffPanelViewModel({ kind: 'error' })).toEqual({ kind: 'error' })
  })

  it('maps binary to deleted:false when modifiedDeleted is absent', () => {
    expect(diffPanelViewModel({ kind: 'binary' })).toEqual({ kind: 'binary', deleted: false })
  })

  it('maps binary with modifiedDeleted through', () => {
    expect(diffPanelViewModel({ kind: 'binary', modifiedDeleted: true })).toEqual({
      kind: 'binary',
      deleted: true
    })
  })

  it('maps a text panel to lines produced via line-diff, and passes truncated through', () => {
    const panel: DiffPanelState = {
      kind: 'text',
      originalContent: 'a\nb',
      modifiedContent: 'a\nc',
      truncated: true
    }
    const view = diffPanelViewModel(panel)
    expect(view).toEqual({
      kind: 'lines',
      truncated: true,
      lines: [
        { cssClass: 'diff-line--ctx', oldNo: 1, newNo: 1, text: 'a' },
        { cssClass: 'diff-line--del', oldNo: 2, newNo: null, text: 'b' },
        { cssClass: 'diff-line--add', oldNo: null, newNo: 2, text: 'c' }
      ]
    })
  })

  it('passes truncated:false through for a text panel', () => {
    const panel: DiffPanelState = {
      kind: 'text',
      originalContent: 'x',
      modifiedContent: 'x',
      truncated: false
    }
    const view = diffPanelViewModel(panel)
    expect(view.kind).toBe('lines')
    expect(view.kind === 'lines' && view.truncated).toBe(false)
  })
})
