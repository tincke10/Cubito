import { describe, expect, it } from 'vitest'
import { createSystemHud } from './system-hud-element'
import type { ConnectionState } from '../../application/scene-store'

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

let created: FakeElement[] = []
const createFakeDocument = (): Document =>
  ({
    createElement: (tag: string) => {
      const el = createFakeElement(tag)
      created.push(el)
      return el
    }
  }) as unknown as Document

const rootOf = (handle: ReturnType<typeof createSystemHud>) => handle.root as unknown as FakeElement
const connectionLineOf = (root: FakeElement) => root.children[0]!
const modeLineOf = (root: FakeElement) => root.children[1]!
const countersLineOf = (root: FakeElement) => root.children[2]!

const connected = (runtimeId = '4f2a9c'): ConnectionState => ({ state: 'connected', runtimeId })

describe('createSystemHud', () => {
  it('renders the three HUD lines with the expected text', () => {
    created = []
    const hud = createSystemHud(createFakeDocument())
    hud.apply({
      connection: connected(),
      branch: 'cubito/auth-retry',
      counts: { tocados: 2, nuevo: 1 }
    })
    const root = rootOf(hud)
    expect(connectionLineOf(root).children[1]!.textContent).toBe('conectado · runtime 4f2a9c')
    expect(modeLineOf(root).textContent).toBe('cubito/auth-retry · sistema en vivo')
    expect(countersLineOf(root).children[0]!.textContent).toBe('claude editando')
    expect(countersLineOf(root).children[1]!.textContent).toBe(' · 2 endpoints tocados · 1 nuevo')
  })

  it('substitutes tocados/nuevo counts on line 3', () => {
    created = []
    const hud = createSystemHud(createFakeDocument())
    hud.apply({ connection: connected(), branch: 'b', counts: { tocados: 0, nuevo: 5 } })
    expect(countersLineOf(rootOf(hud)).children[1]!.textContent).toBe(
      ' · 0 endpoints tocados · 5 nuevo'
    )
  })

  it('sets the connection dot color via a --cubito-* var, per connection state', () => {
    created = []
    const hud = createSystemHud(createFakeDocument())
    const dot = connectionLineOf(rootOf(hud)).children[0]!

    hud.apply({ connection: connected(), branch: 'b', counts: { tocados: 0, nuevo: 0 } })
    expect(dot.style.backgroundColor).toBe('var(--cubito-accent)')

    hud.apply({
      connection: { state: 'connecting' },
      branch: 'b',
      counts: { tocados: 0, nuevo: 0 }
    })
    expect(dot.style.backgroundColor).toBe('var(--cubito-amber)')

    hud.apply({
      connection: { state: 'down', reason: 'timeout' },
      branch: 'b',
      counts: { tocados: 0, nuevo: 0 }
    })
    expect(dot.style.backgroundColor).toBe('var(--cubito-amber-dim)')
  })

  it('renders the shared [g][x][d][c][t] mode switcher, separate from the root', () => {
    created = []
    const hud = createSystemHud(createFakeDocument())
    expect(hud.keyboardBar.root).not.toBe(hud.root)
    const bar = hud.keyboardBar.root as unknown as FakeElement
    expect(bar.children).toHaveLength(5)
    const keys = bar.children.map((chip) => chip.children[0]!.textContent)
    expect(keys).toEqual(['g', 'x', 'd', 'c', 't'])
  })

  it('dispose removes the root and disposes the keyboard bar', () => {
    created = []
    const hud = createSystemHud(createFakeDocument())
    const root = rootOf(hud)
    const bar = hud.keyboardBar.root as unknown as FakeElement
    let rootRemoved = false
    let barRemoved = false
    root.remove = () => (rootRemoved = true)
    bar.remove = () => (barRemoved = true)
    hud.dispose()
    expect(rootRemoved).toBe(true)
    expect(barRemoved).toBe(true)
  })
})
