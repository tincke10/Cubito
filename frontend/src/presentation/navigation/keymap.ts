export type NavDirection = 'parent' | 'child' | 'prev-sibling' | 'next-sibling'

export type NavCommand =
  | { kind: 'move'; direction: NavDirection }
  | { kind: 'focus' }
  | { kind: 'fit-all' }
  | { kind: 'open-terminal' }
  | { kind: 'pin-terminal' }
  | { kind: 'next-terminal' }
  | { kind: 'open-spawn' }
  /** Single escape command (SPAWN-005) — the handler decides spawn-close vs. terminal-close by context. */
  | { kind: 'escape' }
  | { kind: 'open-projects' }
  | { kind: 'open-palette' }
  | { kind: 'open-fan-out' }

type Modifiers = { alt: boolean; ctrl: boolean; meta: boolean; shift: boolean }
type Platform = { isMac: boolean }

const MOVE_DIRECTIONS = {
  h: 'parent',
  l: 'child',
  k: 'prev-sibling',
  j: 'next-sibling',
  ArrowLeft: 'parent',
  ArrowRight: 'child',
  ArrowUp: 'prev-sibling',
  ArrowDown: 'next-sibling'
} as const satisfies Record<string, NavDirection>

const TEXT_ENTRY_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT'])

const hasModifier = (modifiers: Modifiers): boolean =>
  modifiers.alt || modifiers.ctrl || modifiers.meta || modifiers.shift

/** Cmd+P on Mac / Ctrl+P elsewhere, and only that chord — the sole targeted exception to the
 *  `hasModifier` gate below (PROJ-005). Every other modified key, and the opposite-platform
 *  chord, stays gated; bare `p` still falls through to `pin-terminal`. */
const isProjectsChord = (key: string, modifiers: Modifiers, platform: Platform): boolean =>
  key === 'p' &&
  !modifiers.alt &&
  !modifiers.shift &&
  (platform.isMac ? modifiers.meta && !modifiers.ctrl : modifiers.ctrl && !modifiers.meta)

/** Cmd+K on Mac / Ctrl+K elsewhere — same targeted exception shape as isProjectsChord; bare
 *  `k` still falls through to `move prev-sibling`. */
const isPaletteChord = (key: string, modifiers: Modifiers, platform: Platform): boolean =>
  key === 'k' &&
  !modifiers.alt &&
  !modifiers.shift &&
  (platform.isMac ? modifiers.meta && !modifiers.ctrl : modifiers.ctrl && !modifiers.meta)

/** Shift+F — platform-uniform (no meta/ctrl branch, unlike the chords above); bare `f` still
 *  falls through to `focus`. */
const isFanOutChord = (key: string, modifiers: Modifiers): boolean =>
  key === 'f' && modifiers.shift && !modifiers.alt && !modifiers.ctrl && !modifiers.meta

/** `h/l/k/j` move the selection, `f` focuses, `v` fits all; any modifier or unmapped key yields `null`. */
export function resolveNavCommand(
  key: string,
  modifiers: Modifiers,
  platform: Platform
): NavCommand | null {
  if (isProjectsChord(key, modifiers, platform)) {
    return { kind: 'open-projects' }
  }
  if (isPaletteChord(key, modifiers, platform)) {
    return { kind: 'open-palette' }
  }
  if (isFanOutChord(key, modifiers)) {
    return { kind: 'open-fan-out' }
  }
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
  if (key === 't') {
    return { kind: 'open-terminal' }
  }
  if (key === 'p') {
    return { kind: 'pin-terminal' }
  }
  if (key === 'Tab') {
    return { kind: 'next-terminal' }
  }
  if (key === 's') {
    return { kind: 'open-spawn' }
  }
  if (key === 'Escape') {
    return { kind: 'escape' }
  }
  return null
}

/** True when keyboard input should be routed to the DOM instead of the graph. */
export function isTextEntryTarget(tagName: string, isContentEditable: boolean): boolean {
  return isContentEditable || TEXT_ENTRY_TAGS.has(tagName)
}
