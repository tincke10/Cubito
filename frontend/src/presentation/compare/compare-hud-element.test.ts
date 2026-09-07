import { describe, expect, it } from 'vitest'
import { createCompareHud } from './compare-hud-element'
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

const createFakeDocument = (): Document =>
  ({ createElement: (tag: string) => createFakeElement(tag) }) as unknown as Document

const rootOf = (handle: ReturnType<typeof createCompareHud>) =>
  handle.root as unknown as FakeElement
const connectionLineOf = (root: FakeElement) => root.children[0]!
const modeLineOf = (root: FakeElement) => root.children[1]!
const winnerLineOf = (root: FakeElement) => root.children[2]!

const connected = (runtimeId = '4f2a9c'): ConnectionState => ({ state: 'connected', runtimeId })

describe('createCompareHud', () => {
  it('renders the connection and mode lines, and a members/winner line', () => {
    const hud = createCompareHud(createFakeDocument())
    hud.apply({ connection: connected(), membersCount: 3, winnerLabel: null })
    const root = rootOf(hud)
    expect(connectionLineOf(root).children[1]!.textContent).toBe('conectado · runtime 4f2a9c')
    expect(modeLineOf(root).textContent).toBe('comparar la camada')
    expect(winnerLineOf(root).textContent).toBe('3 hijos · ganador: sin elegir')
  })

  it('shows the winner label once one is picked', () => {
    const hud = createCompareHud(createFakeDocument())
    hud.apply({ connection: connected(), membersCount: 3, winnerLabel: 'cubito-alpha' })
    expect(winnerLineOf(rootOf(hud)).textContent).toBe('3 hijos · ganador: cubito-alpha')
  })

  it('sets the connection dot color via a --cubito-* var, per connection state', () => {
    const hud = createCompareHud(createFakeDocument())
    const dot = connectionLineOf(rootOf(hud)).children[0]!

    hud.apply({ connection: connected(), membersCount: 0, winnerLabel: null })
    expect(dot.style.backgroundColor).toBe('var(--cubito-accent)')

    hud.apply({ connection: { state: 'connecting' }, membersCount: 0, winnerLabel: null })
    expect(dot.style.backgroundColor).toBe('var(--cubito-amber)')

    hud.apply({
      connection: { state: 'down', reason: 'timeout' },
      membersCount: 0,
      winnerLabel: null
    })
    expect(dot.style.backgroundColor).toBe('var(--cubito-amber-dim)')
  })

  it('renders its own [g][x][d][c][t] keyboard bar, separate from the root', () => {
    const hud = createCompareHud(createFakeDocument())
    expect(hud.keyboardBar.root).not.toBe(hud.root)
    const bar = hud.keyboardBar.root as unknown as FakeElement
    expect(bar.children).toHaveLength(5)
    const keys = bar.children.map((chip) => chip.children[0]!.textContent)
    expect(keys).toEqual(['g', 'x', 'd', 'c', 't'])
  })

  it('dispose removes the root and disposes the keyboard bar', () => {
    const hud = createCompareHud(createFakeDocument())
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
