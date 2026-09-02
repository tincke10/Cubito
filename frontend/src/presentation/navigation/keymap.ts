export type NavDirection = 'parent' | 'child' | 'prev-sibling' | 'next-sibling'

export type NavCommand = { kind: 'move'; direction: NavDirection } | { kind: 'focus' } | { kind: 'fit-all' }

type Modifiers = { alt: boolean; ctrl: boolean; meta: boolean; shift: boolean }

const MOVE_DIRECTIONS = {
  h: 'parent',
  l: 'child',
  k: 'prev-sibling',
  j: 'next-sibling'
} as const satisfies Record<string, NavDirection>

const TEXT_ENTRY_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT'])

const hasModifier = (modifiers: Modifiers): boolean => modifiers.alt || modifiers.ctrl || modifiers.meta || modifiers.shift

/** `h/l/k/j` move the selection, `f` focuses, `v` fits all; any modifier or unmapped key yields `null`. */
export function resolveNavCommand(key: string, modifiers: Modifiers): NavCommand | null {
  if (hasModifier(modifiers)) {
    return null
  }
  if (key in MOVE_DIRECTIONS) {
    return { kind: 'move', direction: MOVE_DIRECTIONS[key as keyof typeof MOVE_DIRECTIONS] }
  }
  if (key === 'f') {
    return { kind: 'focus' }
  }
  if (key === 'v') {
    return { kind: 'fit-all' }
  }
  return null
}

/** True when keyboard input should be routed to the DOM instead of the graph. */
export function isTextEntryTarget(tagName: string, isContentEditable: boolean): boolean {
  return isContentEditable || TEXT_ENTRY_TAGS.has(tagName)
}
