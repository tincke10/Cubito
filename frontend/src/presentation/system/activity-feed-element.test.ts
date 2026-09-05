import { describe, expect, it } from 'vitest'
import { createActivityFeed } from './activity-feed-element'
import type { ActivityFeedRowView } from './activity-feed-model'

type FakeElement = {
  tagName: string
  readonly style: Record<string, string>
  readonly children: FakeElement[]
  className: string
  textContent: string
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

const rootOf = (handle: ReturnType<typeof createActivityFeed>) =>
  handle.element as unknown as FakeElement
const headerOf = (root: FakeElement) => root.children[0]!
const rowsOf = (root: FakeElement) => root.children[1]!
const footerOf = (root: FakeElement) => root.children[2]!

const row = (
  overrides: Partial<ActivityFeedRowView> & Pick<ActivityFeedRowView, 'id' | 'glyph' | 'cssClass'>
): ActivityFeedRowView => ({
  time: '14:02:11',
  text: overrides.id,
  highlighted: false,
  ...overrides
})

describe('createActivityFeed', () => {
  it('renders the static title and footer label on construction', () => {
    const feed = createActivityFeed(createFakeDocument())
    const root = rootOf(feed)
    expect(headerOf(root).children[0]!.textContent).toBe('actividad del agente')
    expect(footerOf(root).children[1]!.textContent).toBe('escribiendo …')
  })

  it('apply() renders one row per entry, in order', () => {
    const feed = createActivityFeed(createFakeDocument())
    feed.apply([
      row({ id: 'a', glyph: '⏺', cssClass: 'activity-row--read' }),
      row({ id: 'b', glyph: '✎', cssClass: 'activity-row--edit' })
    ])
    const rows = rowsOf(rootOf(feed))
    expect(rows.children).toHaveLength(2)
    expect(rows.children[0]!.children[2]!.textContent).toBe('a')
    expect(rows.children[1]!.children[2]!.textContent).toBe('b')
  })

  it('renders the glyph and text for a row', () => {
    const feed = createActivityFeed(createFakeDocument())
    feed.apply([row({ id: 'leyó src/routes/auth.ts', glyph: '⏺', cssClass: 'activity-row--read' })])
    const rowEl = rowsOf(rootOf(feed)).children[0]!
    expect(rowEl.children[0]!.textContent).toBe('14:02:11')
    expect(rowEl.children[1]!.textContent).toBe('⏺')
    expect(rowEl.children[2]!.textContent).toBe('leyó src/routes/auth.ts')
  })

  it('applies the cssClass verbatim, and a highlighted class only when flagged', () => {
    const feed = createActivityFeed(createFakeDocument())
    feed.apply([
      row({ id: 'a', glyph: '✎', cssClass: 'activity-row--edit', highlighted: true }),
      row({ id: 'b', glyph: '⏺', cssClass: 'activity-row--read', highlighted: false })
    ])
    const [rowA, rowB] = rowsOf(rootOf(feed)).children
    expect(rowA!.className).toBe(
      'cubito-activity-feed__row activity-row--edit cubito-activity-feed__row--highlighted'
    )
    expect(rowB!.className).toBe('cubito-activity-feed__row activity-row--read')
  })

  it('renders a detail element only when the row has detail', () => {
    const feed = createActivityFeed(createFakeDocument())
    feed.apply([
      row({
        id: 'a',
        glyph: '✎',
        cssClass: 'activity-row--edit',
        detail: 'backoff exponencial + jitter'
      }),
      row({ id: 'b', glyph: '⏺', cssClass: 'activity-row--read' })
    ])
    const [rowA, rowB] = rowsOf(rootOf(feed)).children
    expect(rowA!.children).toHaveLength(4)
    expect(rowA!.children[3]!.textContent).toBe('backoff exponencial + jitter')
    expect(rowB!.children).toHaveLength(3)
  })

  it('re-applying replaces previous rows rather than accumulating them', () => {
    const feed = createActivityFeed(createFakeDocument())
    feed.apply([row({ id: 'a', glyph: '⏺', cssClass: 'activity-row--read' })])
    feed.apply([])
    expect(rowsOf(rootOf(feed)).children).toHaveLength(0)
  })

  it('setSubtitle writes and clears the subtitle line', () => {
    const feed = createActivityFeed(createFakeDocument())
    const subtitle = headerOf(rootOf(feed)).children[1]!
    feed.setSubtitle('claude · POST /auth/retry con backoff')
    expect(subtitle.textContent).toBe('claude · POST /auth/retry con backoff')
    feed.setSubtitle(null)
    expect(subtitle.textContent).toBe('')
  })

  it('dispose removes the root element', () => {
    const feed = createActivityFeed(createFakeDocument())
    const root = rootOf(feed)
    let removed = false
    root.remove = () => (removed = true)
    feed.dispose()
    expect(removed).toBe(true)
  })
})
