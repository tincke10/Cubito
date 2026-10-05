import { plainFailure } from '../../application/i18n/user-facing-error'
import { describe, expect, it } from 'vitest'
import { fileQuickOpenPanelModel } from './file-quick-open-view-model'
import type { FileQuickOpenView } from '../../application/file-quick-open-flow'

const view = (
  over: Partial<Extract<FileQuickOpenView, { phase: 'open' }>> = {}
): FileQuickOpenView => ({
  phase: 'open',
  nodeId: 'w',
  query: '',
  rows: [],
  highlighted: 0,
  searching: false,
  error: null,
  ...over
})

describe('fileQuickOpenPanelModel', () => {
  it('is hidden while closed', () => {
    expect(fileQuickOpenPanelModel({ phase: 'closed' }).visible).toBe(false)
  })

  it('hints at what to type when there is no query', () => {
    expect(fileQuickOpenPanelModel(view())).toMatchObject({
      visible: true,
      statusText: 'escribí parte del nombre o de la ruta'
    })
  })

  it('splits each path into name and folder and flags the highlighted and binary rows', () => {
    const model = fileQuickOpenPanelModel(
      view({
        query: 'a',
        highlighted: 1,
        rows: [
          { relativePath: 'src/ui/a.ts', basename: 'a.ts', binary: false },
          { relativePath: 'logo.png', basename: 'logo.png', binary: true }
        ]
      })
    )
    expect(model.rows).toEqual([
      { path: 'src/ui/a.ts', name: 'a.ts', folder: 'src/ui', binary: false, highlighted: false },
      { path: 'logo.png', name: 'logo.png', folder: '', binary: true, highlighted: true }
    ])
    expect(model.statusText).toBeNull()
  })

  it('reports searching, empty results and errors', () => {
    expect(fileQuickOpenPanelModel(view({ query: 'a', searching: true })).statusText).toBe(
      'buscando…'
    )
    expect(fileQuickOpenPanelModel(view({ query: 'a' })).statusText).toBe('sin resultados')
    expect(
      fileQuickOpenPanelModel(view({ query: 'a', error: plainFailure('boom') }))
    ).toMatchObject({
      statusText: null,
      error: plainFailure('boom')
    })
  })
})
