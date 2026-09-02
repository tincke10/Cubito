import { describe, expect, it } from 'vitest'
import { childrenOf, depthOf, parentOf, rootOf, siblingsOf } from './graph-traversal'
import type { WorktreeGraph, WorktreeNode } from './types'
import { inertActivity } from './node-activity'

const node = (overrides: Partial<WorktreeNode> & Pick<WorktreeNode, 'id'>): WorktreeNode => ({
  branch: `refs/heads/${overrides.id}`,
  path: `/path/${overrides.id}`,
  status: 'in-progress',
  isMain: false,
  kind: 'worktree',
  parentId: null,
  childIds: [],
  activity: inertActivity(),
  ...overrides
})

/** Builds a graph from nodes as given, without recomputing edges/rootIds (traversal reads nodes only). */
const graphOf = (nodes: readonly WorktreeNode[]): WorktreeGraph => ({
  nodes: new Map(nodes.map((n) => [n.id, n])),
  edges: [],
  rootIds: nodes.filter((n) => n.parentId === null).map((n) => n.id)
})

describe('parentOf', () => {
  it('returns the parent id when resolvable', () => {
    const graph = graphOf([
      node({ id: 'a', childIds: ['b'] }),
      node({ id: 'b', parentId: 'a' })
    ])
    expect(parentOf(graph, 'b')).toBe('a')
  })

  it('returns null for a root', () => {
    const graph = graphOf([node({ id: 'a' })])
    expect(parentOf(graph, 'a')).toBeNull()
  })

  it('returns null for an unknown id without throwing', () => {
    const graph = graphOf([node({ id: 'a' })])
    expect(parentOf(graph, 'ghost')).toBeNull()
  })
})

describe('childrenOf', () => {
  it('returns child ids filtered to ids present in the graph, in order', () => {
    const graph = graphOf([
      node({ id: 'a', childIds: ['b', 'ghost', 'c'] }),
      node({ id: 'b', parentId: 'a' }),
      node({ id: 'c', parentId: 'a' })
    ])
    expect(childrenOf(graph, 'a')).toEqual(['b', 'c'])
  })

  it('returns an empty array for a leaf', () => {
    const graph = graphOf([node({ id: 'a' })])
    expect(childrenOf(graph, 'a')).toEqual([])
  })

  it('returns an empty array for an unknown id', () => {
    const graph = graphOf([node({ id: 'a' })])
    expect(childrenOf(graph, 'ghost')).toEqual([])
  })
})

describe('siblingsOf', () => {
  it('returns the parent childIds order including self, for a non-root', () => {
    const graph = graphOf([
      node({ id: 'a', childIds: ['b', 'c'] }),
      node({ id: 'b', parentId: 'a' }),
      node({ id: 'c', parentId: 'a' })
    ])
    expect(siblingsOf(graph, 'b')).toEqual(['b', 'c'])
    expect(siblingsOf(graph, 'c')).toEqual(['b', 'c'])
  })

  it('returns rootIds order including self, for a root', () => {
    const graph = graphOf([node({ id: 'a' }), node({ id: 'b' })])
    expect(siblingsOf(graph, 'a')).toEqual(['a', 'b'])
  })

  it('returns an empty array for an unknown id', () => {
    const graph = graphOf([node({ id: 'a' })])
    expect(siblingsOf(graph, 'ghost')).toEqual([])
  })
})

describe('rootOf', () => {
  it('walks to the null-parent ancestor', () => {
    const graph = graphOf([
      node({ id: 'a', childIds: ['b'] }),
      node({ id: 'b', parentId: 'a', childIds: ['c'] }),
      node({ id: 'c', parentId: 'b' })
    ])
    expect(rootOf(graph, 'c')).toBe('a')
  })

  it('returns the id itself when already a root', () => {
    const graph = graphOf([node({ id: 'a' })])
    expect(rootOf(graph, 'a')).toBe('a')
  })

  it('returns the id itself when unknown', () => {
    const graph = graphOf([node({ id: 'a' })])
    expect(rootOf(graph, 'ghost')).toBe('ghost')
  })
})

describe('determinism', () => {
  it('childrenOf/siblingsOf return identical-order arrays on structurally-equal but distinct graphs', () => {
    const build = (): WorktreeGraph =>
      graphOf([
        node({ id: 'a', childIds: ['b', 'c'] }),
        node({ id: 'b', parentId: 'a' }),
        node({ id: 'c', parentId: 'a' })
      ])
    const graph1 = build()
    const graph2 = build()
    expect(graph1).not.toBe(graph2)
    expect(childrenOf(graph1, 'a')).toEqual(childrenOf(graph2, 'a'))
    expect(siblingsOf(graph1, 'b')).toEqual(siblingsOf(graph2, 'b'))
  })
})

describe('depthOf', () => {
  it('is 0 for a root', () => {
    const graph = graphOf([node({ id: 'a' })])
    expect(depthOf(graph, 'a')).toBe(0)
  })

  it('is parent depth + 1 for a child', () => {
    const graph = graphOf([
      node({ id: 'a', childIds: ['b'] }),
      node({ id: 'b', parentId: 'a', childIds: ['c'] }),
      node({ id: 'c', parentId: 'b' })
    ])
    expect(depthOf(graph, 'b')).toBe(1)
    expect(depthOf(graph, 'c')).toBe(2)
  })

  it('guards against cycles without infinite-looping', () => {
    const graph = graphOf([
      node({ id: 'a', parentId: 'b', childIds: ['b'] }),
      node({ id: 'b', parentId: 'a', childIds: ['a'] })
    ])
    expect(() => depthOf(graph, 'a')).not.toThrow()
  })
})
