import { describe, expect, it } from 'vitest'
import { createNodeLabel } from './node-label-element'
import type { NodeLabelHandle } from './node-label-element'
import type { NodeLabelModel } from './node-label-model'

type FakeElement = {
  readonly style: Record<string, string>
  readonly children: FakeElement[]
  className: string
  textContent: string
  appendChild(child: FakeElement): FakeElement
  setAttribute(): void
  remove(): void
}

const createFakeElement = (): FakeElement => ({
  style: {},
  children: [],
  className: '',
  textContent: '',
  appendChild(child) {
    this.children.push(child)
    return child
  },
  setAttribute() {},
  remove() {}
})

const createFakeDocument = (): Document =>
  ({ createElement: () => createFakeElement() }) as unknown as Document

// Navigates the fixed tree shape createNodeLabel builds: root > inner > [primary, secondary, callout],
// callout > [calloutTitle, calloutHint].
const rootOf = (handle: NodeLabelHandle): FakeElement =>
  handle.object.element as unknown as FakeElement
const innerOf = (handle: NodeLabelHandle): FakeElement => rootOf(handle).children[0]!
const primaryOf = (handle: NodeLabelHandle): FakeElement => innerOf(handle).children[0]!
const secondaryOf = (handle: NodeLabelHandle): FakeElement => innerOf(handle).children[1]!
const calloutOf = (handle: NodeLabelHandle): FakeElement => innerOf(handle).children[2]!
const calloutTitleOf = (handle: NodeLabelHandle): FakeElement => calloutOf(handle).children[0]!
const calloutHintOf = (handle: NodeLabelHandle): FakeElement => calloutOf(handle).children[1]!

const model = (overrides: Partial<NodeLabelModel> = {}): NodeLabelModel => ({
  primary: { text: 'feature-x', tone: 'primary' },
  secondary: null,
  callout: null,
  visible: true,
  ...overrides
})

describe('createNodeLabel', () => {
  it('apply({visible: false}) sets object.visible to false and skips the lines', () => {
    const handle = createNodeLabel(createFakeDocument())

    handle.apply(model({ visible: false }))

    expect(handle.object.visible).toBe(false)
    expect(primaryOf(handle).textContent).toBe('')
  })

  it('apply({visible: true}) sets object.visible to true and writes primary/secondary', () => {
    const handle = createNodeLabel(createFakeDocument())

    handle.apply(
      model({
        secondary: { text: 'agente · trabajando', tone: 'info' },
        visible: true
      })
    )

    expect(handle.object.visible).toBe(true)
    expect(primaryOf(handle).textContent).toBe('feature-x')
    expect(secondaryOf(handle).textContent).toBe('agente · trabajando')
  })

  it('a null callout hides the callout line; a callout writes title and hint', () => {
    const handle = createNodeLabel(createFakeDocument())

    handle.apply(model({ callout: null }))
    expect(calloutOf(handle).style.display).toBe('none')

    handle.apply(
      model({
        callout: {
          title: { text: 'esperando input', tone: 'amber' },
          hint: { text: 'revisá el agente para continuar', tone: 'amberDim' }
        }
      })
    )
    expect(calloutOf(handle).style.display).toBe('')
    expect(calloutTitleOf(handle).textContent).toBe('esperando input')
    expect(calloutHintOf(handle).textContent).toBe('revisá el agente para continuar')
  })

  it('dispose() removes the root', () => {
    const handle = createNodeLabel(createFakeDocument())
    let removed = false
    rootOf(handle).remove = () => (removed = true)

    handle.dispose()

    expect(removed).toBe(true)
  })
})
