import { describe, expect, it } from 'vitest'
import {
  toSystemGraphSnapshot,
  toSystemSnapshotEdge,
  toSystemSnapshotNode
} from './system-graph-snapshot-projection'

describe('toSystemSnapshotNode', () => {
  it('coerces an unknown kind to service', () => {
    expect(toSystemSnapshotNode({ id: 'weird', kind: 'unknown-kind', label: 'weird' })).toEqual({
      id: 'weird',
      kind: 'service',
      label: 'weird',
      diff: null
    })
  })

  it('passes through a known kind and optional method/path', () => {
    expect(
      toSystemSnapshotNode({
        id: 'POST /auth/retry',
        kind: 'endpoint',
        label: 'POST /auth/retry',
        method: 'POST',
        path: '/auth/retry'
      })
    ).toEqual({
      id: 'POST /auth/retry',
      kind: 'endpoint',
      label: 'POST /auth/retry',
      method: 'POST',
      path: '/auth/retry',
      diff: null
    })
  })

  it('coerces non-string id/label to empty strings and always sets diff to null', () => {
    expect(toSystemSnapshotNode({ id: 42, kind: 'router', label: null })).toEqual({
      id: '',
      kind: 'router',
      label: '',
      diff: null
    })
  })
})

describe('toSystemSnapshotEdge', () => {
  it('coerces an unknown kind to normal', () => {
    expect(toSystemSnapshotEdge({ from: 'a', to: 'b', kind: 'unknown-kind' })).toEqual({
      from: 'a',
      to: 'b',
      kind: 'normal'
    })
  })

  it('passes through a known kind', () => {
    expect(toSystemSnapshotEdge({ from: 'a', to: 'b', kind: 'flow' })).toEqual({
      from: 'a',
      to: 'b',
      kind: 'flow'
    })
  })
})

describe('toSystemGraphSnapshot', () => {
  it('maps nodes and edges, coercing unknown kinds', () => {
    expect(
      toSystemGraphSnapshot({
        nodes: [
          { id: 'router', kind: 'router', label: 'router' },
          { id: 'weird', kind: 'unknown-kind', label: 'weird' }
        ],
        edges: [{ from: 'router', to: 'weird', kind: 'unknown-kind' }]
      })
    ).toEqual({
      nodes: [
        { id: 'router', kind: 'router', label: 'router', diff: null },
        { id: 'weird', kind: 'service', label: 'weird', diff: null }
      ],
      edges: [{ from: 'router', to: 'weird', kind: 'normal' }]
    })
  })

  it('returns empty arrays when nodes/edges are missing or not arrays', () => {
    expect(toSystemGraphSnapshot({})).toEqual({ nodes: [], edges: [] })
    expect(toSystemGraphSnapshot({ nodes: 'nope', edges: 42 })).toEqual({ nodes: [], edges: [] })
  })
})
