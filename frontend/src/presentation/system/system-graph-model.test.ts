import { describe, expect, it } from 'vitest'
import { SYSTEM_HUD_RESERVED_TOP, systemGraphViewModel } from './system-graph-model'
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
    expect(model).toEqual({ nodes: [], edges: [] })
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

  it('keeps every node clear of the HUD band, with row 0 starting exactly at the reserved top', () => {
    const graph = buildSystemGraph({
      nodes: [
        node({ id: 'e1', kind: 'endpoint' }),
        node({ id: 'e2', kind: 'endpoint' }),
        node({ id: 'd', kind: 'database' })
      ],
      edges: []
    })
    const model = systemGraphViewModel(graph)
    for (const n of model.nodes) expect(n.y).toBeGreaterThanOrEqual(SYSTEM_HUD_RESERVED_TOP)
    expect(model.nodes.find((n) => n.id === 'e1')!.y).toBe(SYSTEM_HUD_RESERVED_TOP)
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
})
