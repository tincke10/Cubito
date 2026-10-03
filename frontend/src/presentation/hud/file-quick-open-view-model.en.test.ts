import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fileQuickOpenPanelModel } from './file-quick-open-view-model'
import type { FileQuickOpenView } from '../../application/file-quick-open-flow'
import { setActiveLanguage } from '../../application/i18n/translate'

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

describe('fileQuickOpenPanelModel (en)', () => {
  beforeEach(() => setActiveLanguage('en'))
  afterEach(() => setActiveLanguage('es'))

  it('hints, searches and reports empty results in English', () => {
    expect(fileQuickOpenPanelModel(view()).statusText).toBe('type part of the name or path')
    expect(fileQuickOpenPanelModel(view({ query: 'a', searching: true })).statusText).toBe(
      'searching…'
    )
    expect(fileQuickOpenPanelModel(view({ query: 'zzz' })).statusText).toBe('no results')
  })
})
