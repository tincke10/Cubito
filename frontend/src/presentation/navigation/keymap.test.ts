import { describe, expect, it } from 'vitest'
import { isTextEntryTarget, resolveNavCommand } from './keymap'

const noModifiers = { alt: false, ctrl: false, meta: false, shift: false }
const MAC = { isMac: true }
const LINUX = { isMac: false }

describe('resolveNavCommand', () => {
  it.each([
    ['h', { kind: 'move', direction: 'parent' }],
    ['l', { kind: 'move', direction: 'child' }],
    ['k', { kind: 'move', direction: 'prev-sibling' }],
    ['j', { kind: 'move', direction: 'next-sibling' }],
    ['ArrowLeft', { kind: 'move', direction: 'parent' }],
    ['ArrowRight', { kind: 'move', direction: 'child' }],
    ['ArrowUp', { kind: 'move', direction: 'prev-sibling' }],
    ['ArrowDown', { kind: 'move', direction: 'next-sibling' }],
    ['f', { kind: 'focus' }],
    ['v', { kind: 'fit-all' }]
  ] as const)('maps %s with no modifiers to %o', (key, expected) => {
    expect(resolveNavCommand(key, noModifiers, LINUX)).toEqual(expected)
  })

  it('returns null for any other key', () => {
    expect(resolveNavCommand('x', noModifiers, LINUX)).toBeNull()
    expect(resolveNavCommand('Enter', noModifiers, LINUX)).toBeNull()
    expect(resolveNavCommand('', noModifiers, LINUX)).toBeNull()
  })

  it.each([
    ['t', { kind: 'open-terminal' }],
    ['p', { kind: 'pin-terminal' }],
    ['Tab', { kind: 'next-terminal' }],
    ['s', { kind: 'open-spawn' }],
    ['Escape', { kind: 'escape' }]
  ] as const)('maps %s with no modifiers to %o', (key, expected) => {
    expect(resolveNavCommand(key, noModifiers, LINUX)).toEqual(expected)
  })

  it.each(['t', 'Tab', 's', 'Escape'] as const)(
    'returns null for terminal/spawn key %s when any modifier is held',
    (key) => {
      expect(resolveNavCommand(key, { ...noModifiers, ctrl: true }, LINUX)).toBeNull()
    }
  )

  const keys = ['h', 'l', 'k', 'j', 'f', 'v'] as const
  const modifierNames = ['alt', 'ctrl', 'meta', 'shift'] as const

  it.each(keys.flatMap((key) => modifierNames.map((modifier) => [key, modifier] as const)))(
    'returns null for %s with %s held',
    (key, modifier) => {
      expect(resolveNavCommand(key, { ...noModifiers, [modifier]: true }, LINUX)).toBeNull()
    }
  )

  describe('⌘P/Ctrl+P projects chord (PROJ-005) — targeted exception to the modifier gate', () => {
    it('meta+p on Mac resolves to open-projects', () => {
      expect(resolveNavCommand('p', { ...noModifiers, meta: true }, MAC)).toEqual({
        kind: 'open-projects'
      })
    })

    it('ctrl+p on Linux/Windows resolves to open-projects', () => {
      expect(resolveNavCommand('p', { ...noModifiers, ctrl: true }, LINUX)).toEqual({
        kind: 'open-projects'
      })
    })

    it('bare p (no modifier) still resolves to pin-terminal on either platform', () => {
      expect(resolveNavCommand('p', noModifiers, MAC)).toEqual({ kind: 'pin-terminal' })
      expect(resolveNavCommand('p', noModifiers, LINUX)).toEqual({ kind: 'pin-terminal' })
    })

    it('the wrong-platform chord stays gated: ctrl+p on Mac, meta+p on Linux/Windows', () => {
      expect(resolveNavCommand('p', { ...noModifiers, ctrl: true }, MAC)).toBeNull()
      expect(resolveNavCommand('p', { ...noModifiers, meta: true }, LINUX)).toBeNull()
    })

    it('adding shift or alt to the platform chord gates it back to null', () => {
      expect(resolveNavCommand('p', { ...noModifiers, meta: true, shift: true }, MAC)).toBeNull()
      expect(resolveNavCommand('p', { ...noModifiers, meta: true, alt: true }, MAC)).toBeNull()
      expect(resolveNavCommand('p', { ...noModifiers, ctrl: true, shift: true }, LINUX)).toBeNull()
      expect(resolveNavCommand('p', { ...noModifiers, ctrl: true, alt: true }, LINUX)).toBeNull()
    })

    it('holding both meta and ctrl together stays gated on either platform', () => {
      expect(resolveNavCommand('p', { ...noModifiers, meta: true, ctrl: true }, MAC)).toBeNull()
      expect(resolveNavCommand('p', { ...noModifiers, meta: true, ctrl: true }, LINUX)).toBeNull()
    })

    it('every other modified key is unaffected by the exception — still gated to null', () => {
      expect(resolveNavCommand('h', { ...noModifiers, meta: true }, MAC)).toBeNull()
      expect(resolveNavCommand('t', { ...noModifiers, ctrl: true }, LINUX)).toBeNull()
    })
  })
})

describe('isTextEntryTarget', () => {
  it('is true for an input tag', () => {
    expect(isTextEntryTarget('INPUT', false)).toBe(true)
  })

  it('is true for a contenteditable element regardless of tag', () => {
    expect(isTextEntryTarget('DIV', true)).toBe(true)
  })

  it('is false for a non-editable non-input element', () => {
    expect(isTextEntryTarget('DIV', false)).toBe(false)
  })

  it("is true for TEXTAREA — covers xterm.js's hidden helper textarea", () => {
    expect(isTextEntryTarget('TEXTAREA', false)).toBe(true)
  })
})
