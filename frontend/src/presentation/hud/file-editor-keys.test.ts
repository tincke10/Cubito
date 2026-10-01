import { describe, expect, it } from 'vitest'
import { isIndentKey, isSaveChord } from './file-editor-keys'

const press = (over: Partial<Parameters<typeof isSaveChord>[0]>) => ({
  key: '',
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  altKey: false,
  ...over
})

describe('isSaveChord', () => {
  it('is Cmd+S on Mac and only that', () => {
    expect(isSaveChord(press({ key: 's', metaKey: true }), { isMac: true })).toBe(true)
    expect(isSaveChord(press({ key: 's', ctrlKey: true }), { isMac: true })).toBe(false)
  })

  it('is Ctrl+S elsewhere and only that', () => {
    expect(isSaveChord(press({ key: 's', ctrlKey: true }), { isMac: false })).toBe(true)
    expect(isSaveChord(press({ key: 's', metaKey: true }), { isMac: false })).toBe(false)
  })

  it('ignores extra modifiers, other letters and a bare s', () => {
    expect(isSaveChord(press({ key: 's', ctrlKey: true, shiftKey: true }), { isMac: false })).toBe(
      false
    )
    expect(isSaveChord(press({ key: 'a', ctrlKey: true }), { isMac: false })).toBe(false)
    expect(isSaveChord(press({ key: 's' }), { isMac: false })).toBe(false)
  })
})

describe('isIndentKey', () => {
  it('is a bare Tab; Shift+Tab keeps its focus-move default', () => {
    expect(isIndentKey(press({ key: 'Tab' }))).toBe(true)
    expect(isIndentKey(press({ key: 'Tab', shiftKey: true }))).toBe(false)
    expect(isIndentKey(press({ key: 'Tab', ctrlKey: true }))).toBe(false)
  })
})
