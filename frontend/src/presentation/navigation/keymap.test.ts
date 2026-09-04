import { describe, expect, it } from 'vitest'
import { isTextEntryTarget, resolveNavCommand } from './keymap'

const noModifiers = { alt: false, ctrl: false, meta: false, shift: false }

describe('resolveNavCommand', () => {
  it.each([
    ['h', { kind: 'move', direction: 'parent' }],
    ['l', { kind: 'move', direction: 'child' }],
    ['k', { kind: 'move', direction: 'prev-sibling' }],
    ['j', { kind: 'move', direction: 'next-sibling' }],
    ['f', { kind: 'focus' }],
    ['v', { kind: 'fit-all' }]
  ] as const)('maps %s with no modifiers to %o', (key, expected) => {
    expect(resolveNavCommand(key, noModifiers)).toEqual(expected)
  })

  it('returns null for any other key', () => {
    expect(resolveNavCommand('x', noModifiers)).toBeNull()
    expect(resolveNavCommand('Enter', noModifiers)).toBeNull()
    expect(resolveNavCommand('', noModifiers)).toBeNull()
  })

  it.each([
    ['t', { kind: 'open-terminal' }],
    ['p', { kind: 'pin-terminal' }],
    ['Tab', { kind: 'next-terminal' }],
    ['Escape', { kind: 'close-terminal' }]
  ] as const)('maps %s with no modifiers to %o', (key, expected) => {
    expect(resolveNavCommand(key, noModifiers)).toEqual(expected)
  })

  it.each(['t', 'p', 'Tab', 'Escape'] as const)(
    'returns null for terminal key %s when any modifier is held',
    (key) => {
      expect(resolveNavCommand(key, { ...noModifiers, ctrl: true })).toBeNull()
    }
  )

  const keys = ['h', 'l', 'k', 'j', 'f', 'v'] as const
  const modifierNames = ['alt', 'ctrl', 'meta', 'shift'] as const

  it.each(keys.flatMap((key) => modifierNames.map((modifier) => [key, modifier] as const)))(
    'returns null for %s with %s held',
    (key, modifier) => {
      expect(resolveNavCommand(key, { ...noModifiers, [modifier]: true })).toBeNull()
    }
  )
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
