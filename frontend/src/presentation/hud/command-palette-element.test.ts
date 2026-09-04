import { describe, expect, it, vi } from 'vitest'
import { createCommandPalette, resolveCommandPaletteKey } from './command-palette-element'
import type { CommandPaletteViewModel } from './command-palette-view-model'

describe('resolveCommandPaletteKey', () => {
  it('ArrowDown and Tab both cycle forward, ArrowUp cycles back', () => {
    expect(resolveCommandPaletteKey('ArrowDown')).toEqual({ type: 'highlight', delta: 1 })
    expect(resolveCommandPaletteKey('Tab')).toEqual({ type: 'highlight', delta: 1 })
    expect(resolveCommandPaletteKey('ArrowUp')).toEqual({ type: 'highlight', delta: -1 })
  })

  it('Enter activates, Escape closes', () => {
    expect(resolveCommandPaletteKey('Enter')).toEqual({ type: 'activate' })
    expect(resolveCommandPaletteKey('Escape')).toEqual({ type: 'close' })
  })

  it('an ordinary keystroke resolves to nothing', () => {
    expect(resolveCommandPaletteKey('a')).toBeNull()
  })
})

type FakeElement = {
  tagName: string
  readonly style: Record<string, string>
  readonly children: FakeElement[]
  className: string
  textContent: string
  value: string
  readonly listeners: Record<string, ((event: unknown) => void)[]>
  addEventListener(type: string, cb: (event: unknown) => void): void
  removeEventListener(type: string, cb: (event: unknown) => void): void
  appendChild(child: FakeElement): FakeElement
  replaceChildren(): void
  setAttribute(): void
  remove(): void
  focus(): void
  fire(type: string, event?: Record<string, unknown>): void
}

const createFakeElement = (tag: string): FakeElement => {
  const listeners: Record<string, ((event: unknown) => void)[]> = {}
  const el: FakeElement = {
    tagName: tag.toUpperCase(),
    style: {},
    children: [],
    className: '',
    textContent: '',
    value: '',
    listeners,
    addEventListener(type, cb) {
      ;(listeners[type] ??= []).push(cb)
    },
    removeEventListener(type, cb) {
      listeners[type] = (listeners[type] ?? []).filter((l) => l !== cb)
    },
    appendChild(child) {
      el.children.push(child)
      return child
    },
    replaceChildren() {
      el.children.length = 0
    },
    setAttribute() {},
    remove() {},
    focus() {},
    fire(type, event = {}) {
      for (const cb of [...(listeners[type] ?? [])])
        cb({ target: el, preventDefault: () => {}, ...event })
    }
  }
  return el
}

const createFakeDocument = (): Document =>
  ({ createElement: (tag: string) => createFakeElement(tag) }) as unknown as Document

const model = (
  overrides: Partial<Extract<CommandPaletteViewModel, { view: 'open' }>> = {}
): CommandPaletteViewModel => ({
  view: 'open',
  query: '',
  rows: [],
  ...overrides
})

const rootOf = (handle: ReturnType<typeof createCommandPalette>) =>
  handle.element as unknown as FakeElement

const backdropOf = (root: FakeElement) => root.children[0]!
const panelOf = (root: FakeElement) => root.children[1]!
const queryInputOf = (root: FakeElement) => panelOf(root).children[0]!.children[1]!
const rowsOf = (root: FakeElement) => panelOf(root).children[1]!

describe('createCommandPalette', () => {
  it('apply() writes the query and renders one row per command', () => {
    const palette = createCommandPalette(createFakeDocument())
    palette.apply(
      model({
        query: 'foc',
        rows: [
          { id: 'focus', label: 'focus', keybindingHint: 'f', available: true, highlighted: true }
        ]
      })
    )
    const root = rootOf(palette)
    expect(queryInputOf(root).value).toBe('foc')
    expect(rowsOf(root).children).toHaveLength(1)
    expect(rowsOf(root).children[0]!.className).toContain('highlighted')
    expect(rowsOf(root).children[0]!.className).not.toContain('disabled')
  })

  it('apply() marks an unavailable row disabled', () => {
    const palette = createCommandPalette(createFakeDocument())
    palette.apply(
      model({
        rows: [
          {
            id: 'fan-out',
            label: 'fan-out',
            keybindingHint: '—',
            available: false,
            highlighted: false
          }
        ]
      })
    )
    const root = rootOf(palette)
    expect(rowsOf(root).children[0]!.className).toContain('disabled')
  })

  it('apply() re-renders rows from scratch each call (no stale rows)', () => {
    const palette = createCommandPalette(createFakeDocument())
    palette.apply(
      model({
        rows: [
          { id: 'focus', label: 'focus', keybindingHint: 'f', available: true, highlighted: true }
        ]
      })
    )
    palette.apply(model({ rows: [] }))
    expect(rowsOf(rootOf(palette)).children).toHaveLength(0)
  })

  it('typing in the query input fires onQueryChange', () => {
    const palette = createCommandPalette(createFakeDocument())
    palette.apply(model())
    const onQueryChange = vi.fn()
    palette.onQueryChange(onQueryChange)
    const input = queryInputOf(rootOf(palette))
    input.value = 'te'
    input.fire('input')
    expect(onQueryChange).toHaveBeenCalledWith('te')
  })

  it('ArrowDown/ArrowUp/Tab fire onHighlight with the right delta, Tab prevents default', () => {
    const palette = createCommandPalette(createFakeDocument())
    palette.apply(model())
    const onHighlight = vi.fn()
    palette.onHighlight(onHighlight)
    const root = rootOf(palette)
    root.fire('keydown', { key: 'ArrowDown' })
    expect(onHighlight).toHaveBeenCalledWith(1)
    root.fire('keydown', { key: 'ArrowUp' })
    expect(onHighlight).toHaveBeenCalledWith(-1)
    const preventDefault = vi.fn()
    root.fire('keydown', { key: 'Tab', preventDefault })
    expect(onHighlight).toHaveBeenCalledWith(1)
    expect(preventDefault).toHaveBeenCalledOnce()
  })

  it('Enter on a highlighted AVAILABLE row fires onActivate with its id', () => {
    const palette = createCommandPalette(createFakeDocument())
    palette.apply(
      model({
        rows: [
          { id: 'focus', label: 'focus', keybindingHint: 'f', available: true, highlighted: true }
        ]
      })
    )
    const onActivate = vi.fn()
    palette.onActivate(onActivate)
    rootOf(palette).fire('keydown', { key: 'Enter' })
    expect(onActivate).toHaveBeenCalledWith('focus')
  })

  it('Enter on a highlighted DISABLED row is a no-op', () => {
    const palette = createCommandPalette(createFakeDocument())
    palette.apply(
      model({
        rows: [
          {
            id: 'fan-out',
            label: 'fan-out',
            keybindingHint: '—',
            available: false,
            highlighted: true
          }
        ]
      })
    )
    const onActivate = vi.fn()
    palette.onActivate(onActivate)
    rootOf(palette).fire('keydown', { key: 'Enter' })
    expect(onActivate).not.toHaveBeenCalled()
  })

  it('clicking an available row fires onActivate, clicking a disabled row is a no-op', () => {
    const palette = createCommandPalette(createFakeDocument())
    palette.apply(
      model({
        rows: [
          { id: 'focus', label: 'focus', keybindingHint: 'f', available: true, highlighted: false },
          {
            id: 'fan-out',
            label: 'fan-out',
            keybindingHint: '—',
            available: false,
            highlighted: false
          }
        ]
      })
    )
    const onActivate = vi.fn()
    palette.onActivate(onActivate)
    const rows = rowsOf(rootOf(palette))
    rows.children[1]!.fire('click')
    expect(onActivate).not.toHaveBeenCalled()
    rows.children[0]!.fire('click')
    expect(onActivate).toHaveBeenCalledWith('focus')
  })

  it('Escape fires onClose', () => {
    const palette = createCommandPalette(createFakeDocument())
    palette.apply(model())
    const onClose = vi.fn()
    palette.onClose(onClose)
    rootOf(palette).fire('keydown', { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('clicking the backdrop fires onClose', () => {
    const palette = createCommandPalette(createFakeDocument())
    palette.apply(model())
    const onClose = vi.fn()
    palette.onClose(onClose)
    backdropOf(rootOf(palette)).fire('click')
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('focusQuery focuses the query input', () => {
    const palette = createCommandPalette(createFakeDocument())
    const input = queryInputOf(rootOf(palette))
    let focused = false
    input.focus = () => (focused = true)
    palette.focusQuery()
    expect(focused).toBe(true)
  })

  it('dispose removes the root element', () => {
    const palette = createCommandPalette(createFakeDocument())
    const root = rootOf(palette)
    let removed = false
    root.remove = () => (removed = true)
    palette.dispose()
    expect(removed).toBe(true)
  })
})
