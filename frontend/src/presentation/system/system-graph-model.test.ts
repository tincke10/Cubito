import { describe, expect, it } from 'vitest'
import {
  NODE_BOX_SIZE,
  SYSTEM_CANVAS_WIDTH,
  SYSTEM_GRAPH_TOP_MARGIN,
  systemGraphViewModel
} from './system-graph-model'
import { buildSystemGraph } from '../../domain/system-graph/build-system-graph'
import { emptySystemGraph } from '../../domain/system-graph/types'
import type { SystemNode } from '../../domain/system-graph/types'

const node = (overrides: Partial<SystemNode> & Pick<SystemNode, 'id' | 'kind'>): SystemNode => ({
  label: overrides.id,
  state: 'idle',
  diff: null,
  ...overrides
})

describe('systemGraphViewModel', () => {
  it('returns an empty model for an empty graph', () => {
    const model = systemGraphViewModel(emptySystemGraph())
    expect(model).toEqual({ nodes: [], edges: [], canvas: { width: 1040, height: 144 } })
  })

  it('sizes the design canvas 1040 wide and tall enough for the lowest node plus its annotations', () => {
    const graph = buildSystemGraph({
      nodes: [
        node({ id: 'e1', kind: 'endpoint' }),
        node({ id: 'e2', kind: 'endpoint' }),
        node({ id: 'd', kind: 'database' })
      ],
      edges: []
    })
    const model = systemGraphViewModel(graph)
    expect(model.canvas).toEqual({ width: SYSTEM_CANVAS_WIDTH, height: 24 + 120 + 44 + 96 })
    expect(SYSTEM_CANVAS_WIDTH).toBe(1040)
  })

  it('assigns tiers by kind: router 0, endpoint 1, service 2, database 3', () => {
    const graph = buildSystemGraph({
      nodes: [
        node({ id: 'r', kind: 'router' }),
        node({ id: 'e', kind: 'endpoint' }),
        node({ id: 's', kind: 'service' }),
        node({ id: 'd', kind: 'database' })
      ],
      edges: []
    })
    const model = systemGraphViewModel(graph)
    const byId = new Map(model.nodes.map((n) => [n.id, n]))
    const xs = ['r', 'e', 's', 'd'].map((id) => byId.get(id)?.x)
    expect(xs[0]).toBeLessThan(xs[1] as number)
    expect(xs[1]).toBeLessThan(xs[2] as number)
    expect(xs[2]).toBeLessThan(xs[3] as number)
  })

  it('stacks nodes within the same tier at increasing y, in insertion order', () => {
    const graph = buildSystemGraph({
      nodes: [
        node({ id: 'e1', kind: 'endpoint' }),
        node({ id: 'e2', kind: 'endpoint' }),
        node({ id: 'e3', kind: 'endpoint' })
      ],
      edges: []
    })
    const model = systemGraphViewModel(graph)
    expect(model.nodes.map((n) => n.id)).toEqual(['e1', 'e2', 'e3'])
    expect(model.nodes[0]!.x).toBe(model.nodes[1]!.x)
    expect(model.nodes[0]!.y).toBeLessThan(model.nodes[1]!.y)
    expect(model.nodes[1]!.y).toBeLessThan(model.nodes[2]!.y)
  })

  it('starts row 0 at the design top margin (the HUD band is reserved in screen space by CSS)', () => {
    const graph = buildSystemGraph({
      nodes: [
        node({ id: 'e1', kind: 'endpoint' }),
        node({ id: 'e2', kind: 'endpoint' }),
        node({ id: 'd', kind: 'database' })
      ],
      edges: []
    })
    const model = systemGraphViewModel(graph)
    for (const n of model.nodes) expect(n.y).toBeGreaterThanOrEqual(SYSTEM_GRAPH_TOP_MARGIN)
    expect(model.nodes.find((n) => n.id === 'e1')!.y).toBe(SYSTEM_GRAPH_TOP_MARGIN)
    expect(SYSTEM_GRAPH_TOP_MARGIN).toBe(24)
  })

  it('produces the same layout across calls given the same graph (stable/deterministic)', () => {
    const graph = buildSystemGraph({
      nodes: [node({ id: 'r', kind: 'router' }), node({ id: 'e', kind: 'endpoint' })],
      edges: []
    })
    expect(systemGraphViewModel(graph)).toEqual(systemGraphViewModel(graph))
  })

  it('derives cssClass from kind + state', () => {
    const graph = buildSystemGraph({
      nodes: [node({ id: 'e', kind: 'endpoint', state: 'editing' })],
      edges: []
    })
    const model = systemGraphViewModel(graph)
    expect(model.nodes[0]!.cssClass).toBe('system-node--endpoint system-node--editing')
  })

  it.each(['idle', 'editing', 'naciendo', 'dirty', 'tested'] as const)(
    'encodes state "%s" into cssClass',
    (state) => {
      const graph = buildSystemGraph({
        nodes: [node({ id: 'e', kind: 'endpoint', state })],
        edges: []
      })
      const model = systemGraphViewModel(graph)
      expect(model.nodes[0]!.cssClass).toContain(`system-node--${state}`)
    }
  )

  it('passes through method, diff and note when present', () => {
    const graph = buildSystemGraph({
      nodes: [
        node({
          id: 'e',
          kind: 'endpoint',
          method: 'POST',
          diff: { added: 18, removed: 6 },
          note: 'editando ahora'
        })
      ],
      edges: []
    })
    const model = systemGraphViewModel(graph)
    expect(model.nodes[0]!.method).toBe('POST')
    expect(model.nodes[0]!.diff).toEqual({ added: 18, removed: 6 })
    expect(model.nodes[0]!.note).toBe('editando ahora')
  })

  it('strips a leading method from the label so the badge does not repeat it', () => {
    const graph = buildSystemGraph({
      nodes: [
        node({ id: 'e', kind: 'endpoint', method: 'POST', label: 'POST /auth/retry' }),
        node({ id: 'p', kind: 'endpoint', method: 'GET', label: '/plain' }),
        node({ id: 'r', kind: 'router', label: 'GET routes.ts' })
      ],
      edges: []
    })
    const byId = new Map(systemGraphViewModel(graph).nodes.map((n) => [n.id, n.label]))
    expect(byId.get('e')).toBe('/auth/retry')
    expect(byId.get('p')).toBe('/plain')
    expect(byId.get('r')).toBe('GET routes.ts')
  })

  it('omits method and note when absent, rather than setting them to undefined', () => {
    const graph = buildSystemGraph({ nodes: [node({ id: 'e', kind: 'endpoint' })], edges: [] })
    const model = systemGraphViewModel(graph)
    expect('method' in model.nodes[0]!).toBe(false)
    expect('note' in model.nodes[0]!).toBe(false)
  })

  it('flags the highlighted node and no other', () => {
    const graph = buildSystemGraph({
      nodes: [node({ id: 'e1', kind: 'endpoint' }), node({ id: 'e2', kind: 'endpoint' })],
      edges: []
    })
    const model = systemGraphViewModel(graph, 'e2')
    const byId = new Map(model.nodes.map((n) => [n.id, n.highlighted]))
    expect(byId.get('e1')).toBe(false)
    expect(byId.get('e2')).toBe(true)
  })

  it('maps edges to {from, to, kind, cssClass}, cssClass derived from kind', () => {
    const graph = buildSystemGraph({
      nodes: [node({ id: 'r', kind: 'router' }), node({ id: 'e', kind: 'endpoint' })],
      edges: [{ from: 'r', to: 'e', kind: 'flow' }]
    })
    const model = systemGraphViewModel(graph)
    expect(model.edges).toEqual([
      { from: 'r', to: 'e', kind: 'flow', cssClass: 'system-edge--flow' }
    ])
  })

  it.each(['normal', 'flow', 'faint'] as const)('derives edge cssClass for kind "%s"', (kind) => {
    const graph = buildSystemGraph({
      nodes: [node({ id: 'r', kind: 'router' }), node({ id: 'e', kind: 'endpoint' })],
      edges: [{ from: 'r', to: 'e', kind }]
    })
    const model = systemGraphViewModel(graph)
    expect(model.edges[0]!.cssClass).toBe(`system-edge--${kind}`)
  })

  it.each([
    ['router', 200, 44],
    ['endpoint', 250, 44],
    ['service', 150, 44],
    ['database', 100, 130]
  ] as const)('sizes a %s node box as %dx%d', (kind, width, height) => {
    const graph = buildSystemGraph({ nodes: [node({ id: 'n', kind })], edges: [] })
    const model = systemGraphViewModel(graph)
    expect(model.nodes[0]!.width).toBe(width)
    expect(model.nodes[0]!.height).toBe(height)
  })

  it('exposes NODE_BOX_SIZE per kind matching the mockup', () => {
    expect(NODE_BOX_SIZE).toEqual({
      router: { width: 200, height: 44 },
      endpoint: { width: 250, height: 44 },
      service: { width: 150, height: 44 },
      database: { width: 100, height: 130 }
    })
  })
})
