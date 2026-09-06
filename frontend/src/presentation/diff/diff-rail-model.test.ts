import { describe, expect, it } from 'vitest'
import { diffRailViewModel } from './diff-rail-model'
import type { DiffFileRow } from '../../application/diff-view-model'

const file = (overrides: Partial<DiffFileRow> & Pick<DiffFileRow, 'path'>): DiffFileRow => ({
  status: 'modified',
  added: 0,
  removed: 0,
  ...overrides
})

describe('diffRailViewModel', () => {
  it('returns [] for an empty file list', () => {
    expect(diffRailViewModel([], null)).toEqual([])
  })

  it('maps path/status through and formats added/removed counts', () => {
    const rows = diffRailViewModel(
      [file({ path: 'a.ts', status: 'modified', added: 3, removed: 1 })],
      null
    )
    expect(rows).toEqual([
      {
        path: 'a.ts',
        status: 'modified',
        addedText: '+3',
        removedText: '−1',
        cssClass: 'diff-rail__row diff-rail__row--modified',
        selected: false
      }
    ])
  })

  it('flags the row matching selectedPath as selected and adds the modifier class', () => {
    const rows = diffRailViewModel([file({ path: 'a.ts' }), file({ path: 'b.ts' })], 'b.ts')
    expect(rows[0]!.selected).toBe(false)
    expect(rows[1]!.selected).toBe(true)
    expect(rows[1]!.cssClass).toBe(
      'diff-rail__row diff-rail__row--modified diff-rail__row--selected'
    )
    expect(rows[0]!.cssClass).toBe('diff-rail__row diff-rail__row--modified')
  })

  it('uses the real minus glyph for removedText, not a hyphen', () => {
    const rows = diffRailViewModel([file({ path: 'a.ts', removed: 5 })], null)
    expect(rows[0]!.removedText).toBe('−5')
    expect(rows[0]!.removedText).not.toBe('-5')
  })

  it.each(['added', 'deleted', 'modified', 'renamed'])(
    'encodes status "%s" into cssClass',
    (status) => {
      const rows = diffRailViewModel([file({ path: 'a.ts', status })], null)
      expect(rows[0]!.cssClass).toContain(`diff-rail__row--${status}`)
    }
  )
})
