import { describe, expect, it } from 'vitest'
import { createDiffRail } from './diff-rail-element'
import type { DiffRailRow } from './diff-rail-model'

type FakeElement = {
  tagName: string
  readonly style: Record<string, string>
  readonly children: FakeElement[]
  className: string
  textContent: string
  onclick: (() => void) | null
  appendChild(child: FakeElement): FakeElement
  replaceChildren(): void
  remove(): void
  dispatchClick(): void
  addEventListener(type: string, handler: () => void): void
}

const createFakeElement = (tag: string): FakeElement => {
  let clickHandler: (() => void) | null = null
  const el: FakeElement = {
    tagName: tag.toUpperCase(),
    style: {},
    children: [],
    className: '',
    textContent: '',
    onclick: null,
    appendChild(child) {
      el.children.push(child)
      return child
    },
    replaceChildren() {
      el.children.length = 0
    },
    remove() {},
    addEventListener(type, handler) {
      if (type === 'click') clickHandler = handler
    },
    dispatchClick() {
      clickHandler?.()
    }
  }
  return el
}

const createFakeDocument = (): Document =>
  ({ createElement: (tag: string) => createFakeElement(tag) }) as unknown as Document

const rootOf = (handle: ReturnType<typeof createDiffRail>) => handle.root as unknown as FakeElement

const row = (overrides: Partial<DiffRailRow> & Pick<DiffRailRow, 'path'>): DiffRailRow => ({
  status: 'modified',
  addedText: '+0',
  removedText: '−0',
  cssClass: 'diff-rail__row diff-rail__row--modified',
  selected: false,
  ...overrides
})

describe('createDiffRail', () => {
  it('renders one row per file', () => {
    const rail = createDiffRail(createFakeDocument())
    rail.apply([row({ path: 'a.ts' }), row({ path: 'b.ts' })])
    expect(rootOf(rail).children).toHaveLength(2)
  })

  it('applies each row cssClass verbatim', () => {
    const rail = createDiffRail(createFakeDocument())
    rail.apply([
      row({ path: 'a.ts', cssClass: 'diff-rail__row diff-rail__row--added' }),
      row({
        path: 'b.ts',
        cssClass: 'diff-rail__row diff-rail__row--deleted diff-rail__row--selected',
        selected: true
      })
    ])
    const [rowA, rowB] = rootOf(rail).children
    expect(rowA!.className).toBe('diff-rail__row diff-rail__row--added')
    expect(rowB!.className).toBe('diff-rail__row diff-rail__row--deleted diff-rail__row--selected')
  })

  it('renders the path and +/- text', () => {
    const rail = createDiffRail(createFakeDocument())
    rail.apply([row({ path: 'src/auth.ts', addedText: '+12', removedText: '−4' })])
    const rowEl = rootOf(rail).children[0]!
    expect(rowEl.children[0]!.textContent).toBe('src/auth.ts')
    expect(rowEl.children[1]!.textContent).toBe('+12')
    expect(rowEl.children[2]!.textContent).toBe('−4')
  })

  it('marks the selected row via the selected modifier class', () => {
    const rail = createDiffRail(createFakeDocument())
    rail.apply([
      row({ path: 'a.ts', selected: false }),
      row({
        path: 'b.ts',
        selected: true,
        cssClass: 'diff-rail__row diff-rail__row--modified diff-rail__row--selected'
      })
    ])
    const [rowA, rowB] = rootOf(rail).children
    expect(rowA!.className).not.toContain('--selected')
    expect(rowB!.className).toContain('diff-rail__row--selected')
  })

  it('calls onSelect with the clicked row path', () => {
    const rail = createDiffRail(createFakeDocument())
    rail.apply([row({ path: 'a.ts' }), row({ path: 'b.ts' })])
    const selected: string[] = []
    rail.onSelect((path) => selected.push(path))
    rootOf(rail).children[1]!.dispatchClick()
    expect(selected).toEqual(['b.ts'])
  })

  it('renders the old-path hint for a renamed row, and nothing extra otherwise', () => {
    const rail = createDiffRail(createFakeDocument())
    rail.apply([
      row({ path: 'b.ts', status: 'renamed', oldPathText: 'a.ts →' }),
      row({ path: 'c.ts' })
    ])
    const [renamedRow, plainRow] = rootOf(rail).children
    expect(renamedRow!.children).toHaveLength(4)
    expect(renamedRow!.children[3]!.textContent).toBe('a.ts →')
    expect(plainRow!.children).toHaveLength(3)
  })

  it('renders an empty-state element for an empty rows list', () => {
    const rail = createDiffRail(createFakeDocument())
    rail.apply([])
    const root = rootOf(rail)
    expect(root.children).toHaveLength(1)
    expect(root.children[0]!.textContent).toBe('sin cambios')
  })

  it('re-applying replaces previous rows rather than accumulating them', () => {
    const rail = createDiffRail(createFakeDocument())
    rail.apply([row({ path: 'a.ts' })])
    rail.apply([row({ path: 'b.ts' }), row({ path: 'c.ts' })])
    expect(rootOf(rail).children).toHaveLength(2)
  })

  it('dispose removes the root element', () => {
    const rail = createDiffRail(createFakeDocument())
    const root = rootOf(rail)
    let removed = false
    root.remove = () => (removed = true)
    rail.dispose()
    expect(removed).toBe(true)
  })
})
