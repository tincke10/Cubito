import { describe, expect, it } from 'vitest'
import { mapSnapshotToSystemGraph } from './system-snapshot-to-graph'
import type { SystemGraphSnapshot } from './ports/runtime-gateway'

const snapshotOf = (overrides: Partial<SystemGraphSnapshot> = {}): SystemGraphSnapshot => ({
  nodes: [],
  edges: [],
  ...overrides
})

describe('mapSnapshotToSystemGraph', () => {
  it('maps an empty snapshot to an empty graph', () => {
    const graph = mapSnapshotToSystemGraph(snapshotOf())
    expect(graph.nodes.size).toBe(0)
    expect(graph.edges).toEqual([])
  })

  it('defaults every node to idle state with no note, keeping diff null', () => {
    const graph = mapSnapshotToSystemGraph(
      snapshotOf({
        nodes: [{ id: 'router', kind: 'router', label: 'router', diff: null }]
      })
    )
    expect(graph.nodes.get('router')).toEqual({
      id: 'router',
      kind: 'router',
      label: 'router',
      state: 'idle',
      diff: null
    })
  })

  it('preserves method and path when present', () => {
    const graph = mapSnapshotToSystemGraph(
      snapshotOf({
        nodes: [
          {
            id: 'POST /auth/retry',
            kind: 'endpoint',
            label: 'POST /auth/retry',
            method: 'POST',
            path: '/auth/retry',
            diff: null
          }
        ]
      })
    )
    expect(graph.nodes.get('POST /auth/retry')).toEqual({
      id: 'POST /auth/retry',
      kind: 'endpoint',
      label: 'POST /auth/retry',
      method: 'POST',
      path: '/auth/retry',
      state: 'idle',
      diff: null
    })
  })

  it('passes edges through unchanged, preserving their kind', () => {
    const graph = mapSnapshotToSystemGraph(
      snapshotOf({
        nodes: [
          { id: 'router', kind: 'router', label: 'router', diff: null },
          { id: 'auth.service', kind: 'service', label: 'auth.service', diff: null }
        ],
        edges: [
          { from: 'router', to: 'auth.service', kind: 'flow' },
          { from: 'auth.service', to: 'router', kind: 'faint' }
        ]
      })
    )
    expect(graph.edges).toEqual([
      { from: 'router', to: 'auth.service', kind: 'flow' },
      { from: 'auth.service', to: 'router', kind: 'faint' }
    ])
  })
})
