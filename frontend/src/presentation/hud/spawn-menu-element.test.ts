import { describe, expect, it } from 'vitest'
import { createSpawnMenu } from './spawn-menu-element'
import type { SpawnRadialViewModel } from './spawn-view-model'

type FakeElement = {
  tagName: string
  readonly style: Record<string, string>
  readonly children: FakeElement[]
  className: string
  textContent: string
  setAttribute(name: string, value: unknown): void
  appendChild(child: FakeElement): FakeElement
  replaceChildren(): void
  remove(): void
}

const createFakeElement = (tag: string): FakeElement => {
  const el: FakeElement = {
    tagName: tag.toUpperCase(),
    style: {},
    children: [],
    className: '',
    textContent: '',
    setAttribute() {},
    appendChild(child) {
      el.children.push(child)
      return child
    },
    replaceChildren() {
      el.children.length = 0
    },
    remove() {}
  }
  return el
}

const createFakeDocument = (): Document =>
  ({ createElement: (tag: string) => createFakeElement(tag) }) as unknown as Document

const model: SpawnRadialViewModel = {
  view: 'radial',
  chips: [
    { key: 's', label: 'spawn hijo', tone: 'active' },
    { key: 'F', label: 'fan-out', tone: 'disabled' },
    { key: 't', label: 'terminal', tone: 'disabled' },
    { key: 'a', label: 'archivar', tone: 'disabled' }
  ]
}

describe('createSpawnMenu', () => {
  it('renders exactly one chip element per model chip, with its key and label', () => {
    const menu = createSpawnMenu(createFakeDocument())
    menu.apply(model)
    const root = menu.object.element as unknown as FakeElement
    expect(root.children).toHaveLength(4)
    root.children.forEach((chip, i) => {
      const [keyEl, labelEl] = chip.children
      expect(keyEl!.textContent).toBe(`[${model.chips[i]!.key}]`)
      expect(labelEl!.textContent).toBe(model.chips[i]!.label)
    })
  })

  it('re-applying replaces the previous chip set rather than appending to it', () => {
    const menu = createSpawnMenu(createFakeDocument())
    menu.apply(model)
    menu.apply({ view: 'radial', chips: model.chips.slice(0, 1) })
    const root = menu.object.element as unknown as FakeElement
    expect(root.children).toHaveLength(1)
  })

  it('uses the accent tone for the active chip and a dim tone for disabled ones — no hex', () => {
    const menu = createSpawnMenu(createFakeDocument())
    menu.apply(model)
    const root = menu.object.element as unknown as FakeElement
    expect(root.children[0]!.style.color).toBe('var(--cubito-accent)')
    expect(root.children[1]!.style.color).toBe('var(--cubito-text-dim)')
  })

  it('dispose removes the root element', () => {
    const menu = createSpawnMenu(createFakeDocument())
    const root = menu.object.element as unknown as FakeElement
    let removed = false
    root.remove = () => (removed = true)
    menu.dispose()
    expect(removed).toBe(true)
  })
})
