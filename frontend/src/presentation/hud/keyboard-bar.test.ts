import { describe, expect, it } from 'vitest'
import { createKeyboardBar } from './keyboard-bar'
import type { HudChip } from './hud-model'

type FakeElement = {
  tagName: string
  readonly style: Record<string, string>
  readonly children: FakeElement[]
  readonly classes: Set<string>
  className: string
  textContent: string
  tabIndex?: number
  onclick: unknown
  appendChild(child: FakeElement): FakeElement
  remove(): void
}

const createFakeElement = (tag: string): FakeElement => {
  const classes = new Set<string>()
  const el = {
    tagName: tag.toUpperCase(),
    style: {},
    children: [] as FakeElement[],
    classes,
    textContent: '',
    onclick: undefined,
    appendChild(child: FakeElement) {
      el.children.push(child)
      return child
    },
    replaceChildren() {
      el.children.length = 0
    },
    remove() {}
  }
  return Object.defineProperty(el, 'className', {
    get: () => Array.from(classes).join(' '),
    set: (value: string) => {
      classes.clear()
      value
        .split(/\s+/)
        .filter(Boolean)
        .forEach((c) => classes.add(c))
    }
  }) as unknown as FakeElement
}

const createFakeDocument = (): Document =>
  ({ createElement: (tag: string) => createFakeElement(tag) }) as unknown as Document

const macChips: readonly HudChip[] = [
  { key: 'hjkl', description: 'navegar' },
  { key: 'f', description: 'focus' },
  { key: 'v', description: 'ver todo' },
  { key: 's', description: 'spawn' },
  { key: '⌘K', description: 'paleta' }
]

describe('createKeyboardBar', () => {
  it('renders exactly one chip per entry, with the given key and description', () => {
    const bar = createKeyboardBar(createFakeDocument())
    bar.apply(macChips)
    const root = bar.root as unknown as FakeElement
    expect(root.children).toHaveLength(macChips.length)
    root.children.forEach((chip, i) => {
      const [keyEl, descriptionEl] = chip.children
      expect(keyEl!.textContent).toBe(macChips[i]!.key)
      expect(descriptionEl!.textContent).toBe(macChips[i]!.description)
    })
  })

  it('re-applying replaces the previous chip set rather than appending to it', () => {
    const bar = createKeyboardBar(createFakeDocument())
    bar.apply(macChips)
    bar.apply(macChips.slice(0, 2))
    const root = bar.root as unknown as FakeElement
    expect(root.children).toHaveLength(2)
  })

  it('the ⌘K / Ctrl+K palette chip has no click handler and is not focusable', () => {
    const bar = createKeyboardBar(createFakeDocument())
    bar.apply(macChips)
    const root = bar.root as unknown as FakeElement
    const paletteChip = root.children.find((chip) =>
      chip.children.some((child) => child.textContent === '⌘K')
    )
    expect(paletteChip).toBeDefined()
    expect(paletteChip!.onclick == null).toBe(true)
    expect(paletteChip!.tabIndex).toBeUndefined()
  })

  it('every chip is inert: pointer-events none, no click handler, not focusable', () => {
    const bar = createKeyboardBar(createFakeDocument())
    bar.apply(macChips)
    const root = bar.root as unknown as FakeElement
    for (const chip of root.children) {
      expect(chip.style.pointerEvents).toBe('none')
      expect(chip.onclick == null).toBe(true)
      expect(chip.tabIndex).toBeUndefined()
    }
  })
})
