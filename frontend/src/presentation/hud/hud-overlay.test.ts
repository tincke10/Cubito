import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { createHudOverlay } from './hud-overlay'
import { hudText } from './hud-model'
import type { HudModel } from './hud-model'

type FakeElement = {
  tagName: string
  readonly style: Record<string, string>
  readonly children: FakeElement[]
  readonly classes: Set<string>
  className: string
  textContent: string
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
    appendChild(child: FakeElement) {
      el.children.push(child)
      return child
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
  }) as FakeElement
}

const createFakeDocument = (): Document =>
  ({ createElement: (tag: string) => createFakeElement(tag) }) as unknown as Document

const everyStyle = (
  el: FakeElement,
  predicate: (style: Record<string, string>) => boolean
): boolean => predicate(el.style) && el.children.every((child) => everyStyle(child, predicate))

const fixture = (overrides: Partial<HudModel> = {}): HudModel => {
  const model = baseFixture(overrides)
  return { ...model, text: overrides.text ?? hudText(model.repo, model.counters) }
}

const baseFixture = (overrides: Partial<HudModel>): HudModel => ({
  text: { repo: '', countersPrefix: '', countersWaiting: '' },
  connection: { label: 'conectado · runtime 4f2a9c', dotColor: 'accent' },
  repo: { displayName: 'Cubito', nodeCount: 4 },
  counters: {
    total: 6,
    working: 2,
    'waiting-input': 1,
    spawning: 0,
    archived: 0,
    dirty: 0,
    unread: 0,
    idle: 3
  },
  chips: [],
  syncNotice: null,
  ...overrides
})

describe('createHudOverlay', () => {
  it('renders 4 lines: connection, repo, counters, sync notice', () => {
    const overlay = createHudOverlay(createFakeDocument())
    overlay.apply(fixture())
    const root = overlay.root as unknown as FakeElement
    expect(root.children).toHaveLength(4)
  })

  it('hides the sync notice line when there is no failure', () => {
    const overlay = createHudOverlay(createFakeDocument())
    overlay.apply(fixture())
    const notice = (overlay.root as unknown as FakeElement).children[3]!
    expect(notice.style.display).toBe('none')
  })

  it('shows the sync failure as lead plus detail, and hides it again on recovery', () => {
    const overlay = createHudOverlay(createFakeDocument())
    overlay.apply(fixture({ syncNotice: { lead: 'no se pudieron actualizar', detail: 'boom' } }))
    const notice = (overlay.root as unknown as FakeElement).children[3]!
    expect(notice.style.display).toBe('')
    expect(notice.textContent).toBe('no se pudieron actualizar')
    expect(notice.children[0]!.textContent).toBe('boom')
    overlay.apply(fixture())
    expect(notice.style.display).toBe('none')
  })

  it('connection line shows a dot plus the connection label', () => {
    const overlay = createHudOverlay(createFakeDocument())
    overlay.apply(fixture())
    const [connectionLine] = (overlay.root as unknown as FakeElement).children
    expect(connectionLine!.children).toHaveLength(2)
    const [dot, text] = connectionLine!.children
    expect(dot!.tagName).toBe('SPAN')
    expect(text!.textContent).toBe('conectado · runtime 4f2a9c')
  })

  it('repo line shows the active repo displayName and node count', () => {
    const overlay = createHudOverlay(createFakeDocument())
    overlay.apply(fixture({ repo: { displayName: 'Cubito', nodeCount: 4 } }))
    const [, repoLine] = (overlay.root as unknown as FakeElement).children
    expect(repoLine!.textContent).toContain('Cubito')
    expect(repoLine!.textContent).toContain('4 nodos')
  })

  it('repo line shows placeholder text when repo is null', () => {
    const overlay = createHudOverlay(createFakeDocument())
    overlay.apply(fixture({ repo: null }))
    const [, repoLine] = (overlay.root as unknown as FakeElement).children
    expect(repoLine!.textContent.length).toBeGreaterThan(0)
    expect(repoLine!.textContent).not.toContain('Cubito')
  })

  it('counters line wraps the "esperando input" segment in a pulse-amber span', () => {
    const overlay = createHudOverlay(createFakeDocument())
    overlay.apply(
      fixture({
        counters: {
          total: 6,
          working: 2,
          'waiting-input': 1,
          spawning: 0,
          archived: 0,
          dirty: 0,
          unread: 0,
          idle: 3
        }
      })
    )
    const [, , countersLine] = (overlay.root as unknown as FakeElement).children
    const [prefix, waiting] = countersLine!.children
    expect(prefix!.textContent).toContain('6 nodos')
    expect(prefix!.textContent).toContain('2 agentes activos')
    expect(waiting!.textContent).toBe('1 esperando input')
    expect(waiting!.classes.has('pulse')).toBe(true)
    expect(prefix!.classes.has('pulse')).toBe(false)
  })

  it('the root and every descendant carry pointer-events: none', () => {
    const overlay = createHudOverlay(createFakeDocument())
    overlay.apply(fixture())
    const root = overlay.root as unknown as FakeElement
    expect(everyStyle(root, (style) => style.pointerEvents === 'none')).toBe(true)
  })

  it('the accent glow class applies only to the connection line, not repo or counters', () => {
    const overlay = createHudOverlay(createFakeDocument())
    overlay.apply(fixture())
    const [connectionLine, repoLine, countersLine] = (overlay.root as unknown as FakeElement)
      .children
    expect(connectionLine!.classes.has('cubito-hud__line--glow')).toBe(true)
    expect(repoLine!.classes.has('cubito-hud__line--glow')).toBe(false)
    expect(countersLine!.classes.has('cubito-hud__line--glow')).toBe(false)
  })

  it('never imports application/* — the DOM writer takes only a HudModel', () => {
    const source = readFileSync(
      fileURLToPath(new URL('./hud-overlay.ts', import.meta.url)),
      'utf-8'
    )
    expect(source).not.toMatch(/from ['"].*application/)
    expect(source).not.toMatch(/:\s*SceneState\b/)
  })
})
