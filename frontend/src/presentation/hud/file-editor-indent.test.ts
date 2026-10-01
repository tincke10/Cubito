import { describe, expect, it } from 'vitest'
import { indentUnitFor, insertIndent } from './file-editor-indent'

describe('indentUnitFor', () => {
  it('uses a tab when the first indented line starts with one', () => {
    expect(indentUnitFor('a\n\tb\n  c')).toBe('\t')
  })

  it('defaults to two spaces (space-indented or unindented files)', () => {
    expect(indentUnitFor('a\n    b')).toBe('  ')
    expect(indentUnitFor('plain')).toBe('  ')
    expect(indentUnitFor('')).toBe('  ')
  })
})

describe('insertIndent', () => {
  it('inserts the unit at the caret and moves it past', () => {
    expect(insertIndent('abcd', 2, 2, '  ')).toEqual({ value: 'ab  cd', caret: 4 })
  })

  it('replaces a selection', () => {
    expect(insertIndent('abcd', 1, 3, '\t')).toEqual({ value: 'a\td', caret: 2 })
  })
})
