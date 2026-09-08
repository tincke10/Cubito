import { describe, expect, it } from 'vitest'
import { createSystemGraph } from './system-graph-element'
import { NODE_BOX_SIZE } from './system-graph-model'
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
  ...NODE_BOX_SIZE[overrides.kind],
  state: 'idle',
  diff: null,
  cssClass: `system-node--${overrides.kind} system-node--idle`,
  highlighted: false,
  ...overrides
})

const model = (overrides: Partial<SystemGraphViewModel> = {}): SystemGraphViewModel => ({
  nodes: [],
  edges: [],
  canvas: { width: 1040, height: 216 },
  ...overrides
})

describe('createSystemGraph', () => {
  it('sets the viewBox from the model canvas so a narrow canvas scales the graph to fit', () => {
    const graph = createSystemGraph(createFakeDocument())
    graph.apply(model({ canvas: { width: 1040, height: 500 } }))
    const root = rootOf(graph)
    expect(root.getAttribute('viewBox')).toBe('0 0 1040 500')
    expect(root.getAttribute('preserveAspectRatio')).toBe('xMinYMin meet')
  })

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

  it('draws a router box sized from the node view, at the group-local origin', () => {
    const graph = createSystemGraph(createFakeDocument())
    graph.apply(model({ nodes: [node({ id: 'r', kind: 'router' })] }))
    const rect = nodesLayerOf(rootOf(graph)).children[0]!.children[0]!
    expect(rect.getAttribute('x')).toBe('0')
    expect(rect.getAttribute('y')).toBe('0')
    expect(rect.getAttribute('width')).toBe('200')
    expect(rect.getAttribute('height')).toBe('44')
    expect(rect.getAttribute('rx')).toBe('4')
  })

  it('centers the router label over the box width', () => {
    const graph = createSystemGraph(createFakeDocument())
    graph.apply(model({ nodes: [node({ id: 'r', kind: 'router', label: 'api/routes' })] }))
    const g = nodesLayerOf(rootOf(graph)).children[0]!
    const label = g.children.find((c) => c.getAttribute('class') === 'system-node__label')!
    expect(label.getAttribute('x')).toBe('100')
    expect(label.getAttribute('y')).toBe('27')
    expect(label.getAttribute('text-anchor')).toBe('middle')
  })

  it('positions the endpoint method and label side by side without centering', () => {
    const graph = createSystemGraph(createFakeDocument())
    graph.apply(
      model({
        nodes: [node({ id: 'e', kind: 'endpoint', label: '/auth/retry', method: 'POST' })]
      })
    )
    const g = nodesLayerOf(rootOf(graph)).children[0]!
    const byClass = (cls: string) => g.children.find((c) => c.getAttribute('class') === cls)
    expect(byClass('system-node__method')!.getAttribute('x')).toBe('20')
    expect(byClass('system-node__method')!.getAttribute('y')).toBe('27')
    expect(byClass('system-node__label')!.getAttribute('x')).toBe('65')
    expect(byClass('system-node__label')!.getAttribute('y')).toBe('27')
    expect(byClass('system-node__label')!.getAttribute('text-anchor')).toBeNull()
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
    expect(byClass('system-node__diff')!.getAttribute('y')).toBe('60')
    expect(byClass('system-node__note')!.getAttribute('y')).toBe('76')
  })

  it('keeps the note at the annotation row when there is no diff', () => {
    const graph = createSystemGraph(createFakeDocument())
    graph.apply(
      model({
        nodes: [node({ id: 'e', kind: 'endpoint', diff: null, note: 'editando ahora' })]
      })
    )
    const g = nodesLayerOf(rootOf(graph)).children[0]!
    const byClass = (cls: string) => g.children.find((c) => c.getAttribute('class') === cls)
    expect(byClass('system-node__note')!.getAttribute('y')).toBe('60')
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

  it('renders one <line> per edge, anchored on the source right-middle and target left-middle', () => {
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
    expect(line.getAttribute('x1')).toBe('240')
    expect(line.getAttribute('y1')).toBe('62')
    expect(line.getAttribute('x2')).toBe('320')
    expect(line.getAttribute('y2')).toBe('62')
  })

  it('anchors an edge into a database on the left edge of its cylinder body', () => {
    const graph = createSystemGraph(createFakeDocument())
    graph.apply(
      model({
        nodes: [
          node({ id: 's', kind: 'service', x: 775, y: 288 }),
          node({ id: 'd', kind: 'database', x: 935, y: 310 })
        ],
        edges: [{ from: 's', to: 'd', kind: 'normal', cssClass: 'system-edge--normal' }]
      })
    )
    const line = edgesLayerOf(rootOf(graph)).children[0]!
    expect(line.getAttribute('x1')).toBe('925')
    expect(line.getAttribute('y1')).toBe('310')
    expect(line.getAttribute('x2')).toBe('947')
    expect(line.getAttribute('y2')).toBe('360')
  })

  it('re-applying replaces previous nodes/edges rather than accumulating them', () => {
    const graph = createSystemGraph(createFakeDocument())
    graph.apply(
      model({
        nodes: [node({ id: 'a', kind: 'router' })],
        edges: [{ from: 'a', to: 'a', kind: 'normal', cssClass: 'system-edge--normal' }]
      })
    )
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
