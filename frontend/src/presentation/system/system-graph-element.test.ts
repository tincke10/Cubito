import { describe, expect, it } from 'vitest'
import { createSystemGraph } from './system-graph-element'
import type { SystemGraphNodeView, SystemGraphViewModel } from './system-graph-model'

type FakeElement = {
  tagName: string
  readonly attributes: Record<string, string>
  readonly children: FakeElement[]
  textContent: string
  setAttribute(name: string, value: string): void
  getAttribute(name: string): string | null
  appendChild(child: FakeElement): FakeElement
  replaceChildren(): void
  remove(): void
}

const createFakeElement = (tag: string): FakeElement => {
  const attributes: Record<string, string> = {}
  const el: FakeElement = {
    tagName: tag.toUpperCase(),
    attributes,
    children: [],
    textContent: '',
    setAttribute(name, value) {
      attributes[name] = value
    },
    getAttribute(name) {
      return attributes[name] ?? null
    },
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
  ({ createElementNS: (_ns: string, tag: string) => createFakeElement(tag) }) as unknown as Document

const rootOf = (handle: ReturnType<typeof createSystemGraph>) =>
  handle.element as unknown as FakeElement
const edgesLayerOf = (root: FakeElement) => root.children[0]!
const nodesLayerOf = (root: FakeElement) => root.children[1]!

const node = (
  overrides: Partial<SystemGraphNodeView> & Pick<SystemGraphNodeView, 'id' | 'kind'>
): SystemGraphNodeView => ({
  label: overrides.id,
  x: 0,
  y: 0,
  state: 'idle',
  diff: null,
  cssClass: `system-node--${overrides.kind} system-node--idle`,
  highlighted: false,
  ...overrides
})

const model = (overrides: Partial<SystemGraphViewModel> = {}): SystemGraphViewModel => ({
  nodes: [],
  edges: [],
  ...overrides
})

describe('createSystemGraph', () => {
  it('renders an empty model with no node or edge elements', () => {
    const graph = createSystemGraph(createFakeDocument())
    graph.apply(model())
    const root = rootOf(graph)
    expect(edgesLayerOf(root).children).toHaveLength(0)
    expect(nodesLayerOf(root).children).toHaveLength(0)
  })

  it('renders one <g> per node', () => {
    const graph = createSystemGraph(createFakeDocument())
    graph.apply(
      model({ nodes: [node({ id: 'a', kind: 'router' }), node({ id: 'b', kind: 'endpoint' })] })
    )
    const nodesLayer = nodesLayerOf(rootOf(graph))
    expect(nodesLayer.children).toHaveLength(2)
    for (const g of nodesLayer.children) expect(g.tagName).toBe('G')
  })

  it('applies the model cssClass verbatim, and adds a highlighted class only when flagged', () => {
    const graph = createSystemGraph(createFakeDocument())
    graph.apply(
      model({
        nodes: [
          node({
            id: 'a',
            kind: 'endpoint',
            cssClass: 'system-node--endpoint system-node--editing'
          }),
          node({
            id: 'b',
            kind: 'endpoint',
            cssClass: 'system-node--endpoint system-node--idle',
            highlighted: true
          })
        ]
      })
    )
    const [gA, gB] = nodesLayerOf(rootOf(graph)).children
    expect(gA!.getAttribute('class')).toBe('system-node--endpoint system-node--editing')
    expect(gB!.getAttribute('class')).toBe(
      'system-node--endpoint system-node--idle system-node--highlighted'
    )
  })

  it('positions each node group via data-x/data-y attributes matching the model', () => {
    const graph = createSystemGraph(createFakeDocument())
    graph.apply(model({ nodes: [node({ id: 'a', kind: 'router', x: 40, y: 160 })] }))
    const g = nodesLayerOf(rootOf(graph)).children[0]!
    expect(g.getAttribute('data-x')).toBe('40')
    expect(g.getAttribute('data-y')).toBe('160')
    expect(g.getAttribute('transform')).toBe('translate(40, 160)')
  })

  it('renders a database node as a cylinder (path + ellipse), not a rect', () => {
    const graph = createSystemGraph(createFakeDocument())
    graph.apply(model({ nodes: [node({ id: 'db', kind: 'database', label: 'db' })] }))
    const g = nodesLayerOf(rootOf(graph)).children[0]!
    const shapeTags = g.children
      .filter((child) => child.getAttribute('class') === 'system-node__shape')
      .map((c) => c.tagName)
    expect(shapeTags).toEqual(['PATH', 'ELLIPSE'])
  })

  it('renders a rect shape for router/endpoint/service nodes', () => {
    const graph = createSystemGraph(createFakeDocument())
    graph.apply(model({ nodes: [node({ id: 'r', kind: 'router' })] }))
    const g = nodesLayerOf(rootOf(graph)).children[0]!
    expect(g.children[0]!.tagName).toBe('RECT')
  })

  it('renders label, method, diff and note text when present', () => {
    const graph = createSystemGraph(createFakeDocument())
    graph.apply(
      model({
        nodes: [
          node({
            id: 'e',
            kind: 'endpoint',
            label: '/auth/retry',
            method: 'POST',
            diff: { added: 18, removed: 6 },
            note: 'editando ahora'
          })
        ]
      })
    )
    const g = nodesLayerOf(rootOf(graph)).children[0]!
    const byClass = (cls: string) => g.children.find((c) => c.getAttribute('class') === cls)
    expect(byClass('system-node__label')!.textContent).toBe('/auth/retry')
    expect(byClass('system-node__method')!.textContent).toBe('POST')
    expect(byClass('system-node__diff')!.textContent).toBe('+18 −6')
    expect(byClass('system-node__note')!.textContent).toBe('editando ahora')
  })

  it('omits method/diff/note elements when absent', () => {
    const graph = createSystemGraph(createFakeDocument())
    graph.apply(model({ nodes: [node({ id: 'e', kind: 'endpoint' })] }))
    const g = nodesLayerOf(rootOf(graph)).children[0]!
    const classes = g.children.map((c) => c.getAttribute('class'))
    expect(classes).not.toContain('system-node__method')
    expect(classes).not.toContain('system-node__diff')
    expect(classes).not.toContain('system-node__note')
  })

  it('renders one <line> per edge, with the edge cssClass, positioned at the endpoints', () => {
    const graph = createSystemGraph(createFakeDocument())
    graph.apply(
      model({
        nodes: [
          node({ id: 'r', kind: 'router', x: 40, y: 40 }),
          node({ id: 'e', kind: 'endpoint', x: 320, y: 40 })
        ],
        edges: [{ from: 'r', to: 'e', kind: 'flow', cssClass: 'system-edge--flow' }]
      })
    )
    const edgesLayer = edgesLayerOf(rootOf(graph))
    expect(edgesLayer.children).toHaveLength(1)
    const line = edgesLayer.children[0]!
    expect(line.tagName).toBe('LINE')
    expect(line.getAttribute('class')).toBe('system-edge--flow')
    expect(line.getAttribute('x1')).toBe('40')
    expect(line.getAttribute('y1')).toBe('40')
    expect(line.getAttribute('x2')).toBe('320')
    expect(line.getAttribute('y2')).toBe('40')
  })

  it('re-applying replaces previous nodes/edges rather than accumulating them', () => {
    const graph = createSystemGraph(createFakeDocument())
    graph.apply({
      nodes: [node({ id: 'a', kind: 'router' })],
      edges: [{ from: 'a', to: 'a', kind: 'normal', cssClass: 'system-edge--normal' }]
    })
    graph.apply(model())
    const root = rootOf(graph)
    expect(nodesLayerOf(root).children).toHaveLength(0)
    expect(edgesLayerOf(root).children).toHaveLength(0)
  })

  it('dispose removes the root element', () => {
    const graph = createSystemGraph(createFakeDocument())
    const root = rootOf(graph)
    let removed = false
    root.remove = () => (removed = true)
    graph.dispose()
    expect(removed).toBe(true)
  })
})
