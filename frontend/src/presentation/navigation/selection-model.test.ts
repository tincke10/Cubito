import { describe, expect, it } from 'vitest'
import { initialSelection, moveSelection, reconcileSelection } from './selection-model'
import type { WorktreeGraph, WorktreeNode } from '../../domain/worktree-graph/types'
import { inertActivity } from '../../domain/worktree-graph/node-activity'
import { emptyWorktreeGraph } from '../../domain/worktree-graph/types'

const node = (overrides: Partial<WorktreeNode> & Pick<WorktreeNode, 'id'>): WorktreeNode => ({
  repoId: 'repo',
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

const graphOf = (nodes: readonly WorktreeNode[]): WorktreeGraph => ({
  nodes: new Map(nodes.map((n) => [n.id, n])),
  edges: [],
  rootIds: nodes.filter((n) => n.parentId === null).map((n) => n.id)
})

describe('initialSelection', () => {
  it('picks the main root when present', () => {
    const graph = graphOf([node({ id: 'a', isMain: false }), node({ id: 'b', isMain: true })])
    expect(initialSelection(graph)).toBe('b')
  })

  it('falls back to the first rootIds entry when no root is main', () => {
    const graph = graphOf([node({ id: 'a' }), node({ id: 'b' })])
    expect(initialSelection(graph)).toBe('a')
  })

  it('returns null for an empty graph', () => {
    expect(initialSelection(emptyWorktreeGraph())).toBeNull()
  })
})

describe('moveSelection', () => {
  it('is a no-op moving to parent from a root', () => {
    const graph = graphOf([node({ id: 'a' })])
    expect(moveSelection(graph, 'a', 'parent')).toBe('a')
  })

  it('moves to the parent id from a child', () => {
    const graph = graphOf([node({ id: 'a', childIds: ['b'] }), node({ id: 'b', parentId: 'a' })])
    expect(moveSelection(graph, 'b', 'parent')).toBe('a')
  })

  it('is a no-op moving to child from a childless node', () => {
    const graph = graphOf([node({ id: 'a' })])
    expect(moveSelection(graph, 'a', 'child')).toBe('a')
  })

  it('moves to the first child id', () => {
    const graph = graphOf([
      node({ id: 'a', childIds: ['b', 'c'] }),
      node({ id: 'b', parentId: 'a' }),
      node({ id: 'c', parentId: 'a' })
    ])
    expect(moveSelection(graph, 'a', 'child')).toBe('b')
  })

  // CLAMP per design §4 — reversible: flip to modulo wrap here + this assertion if UX testing disagrees
  it('clamps at the last sibling on next-sibling (no wrap to first)', () => {
    const graph = graphOf([
      node({ id: 'a', childIds: ['b', 'c'] }),
      node({ id: 'b', parentId: 'a' }),
      node({ id: 'c', parentId: 'a' })
    ])
    expect(moveSelection(graph, 'c', 'next-sibling')).toBe('c')
  })

  it('clamps at the first sibling on prev-sibling (no wrap to last)', () => {
    const graph = graphOf([
      node({ id: 'a', childIds: ['b', 'c'] }),
      node({ id: 'b', parentId: 'a' }),
      node({ id: 'c', parentId: 'a' })
    ])
    expect(moveSelection(graph, 'b', 'prev-sibling')).toBe('b')
  })

  it('steps to the next sibling', () => {
    const graph = graphOf([
      node({ id: 'a', childIds: ['b', 'c'] }),
      node({ id: 'b', parentId: 'a' }),
      node({ id: 'c', parentId: 'a' })
    ])
    expect(moveSelection(graph, 'b', 'next-sibling')).toBe('c')
  })

  it('steps to the prev sibling', () => {
    const graph = graphOf([
      node({ id: 'a', childIds: ['b', 'c'] }),
      node({ id: 'b', parentId: 'a' }),
      node({ id: 'c', parentId: 'a' })
    ])
    expect(moveSelection(graph, 'c', 'prev-sibling')).toBe('b')
  })

  it('falls back to initialSelection when currentId is null', () => {
    const graph = graphOf([node({ id: 'a', isMain: true }), node({ id: 'b' })])
    expect(moveSelection(graph, null, 'parent')).toBe('a')
    expect(moveSelection(graph, null, 'child')).toBe('a')
    expect(moveSelection(graph, null, 'next-sibling')).toBe('a')
  })

  it('never throws for an unknown currentId, and is a no-op', () => {
    const graph = graphOf([node({ id: 'a' })])
    expect(() => moveSelection(graph, 'ghost', 'next-sibling')).not.toThrow()
    expect(moveSelection(graph, 'ghost', 'next-sibling')).toBe('ghost')
    expect(moveSelection(graph, 'ghost', 'parent')).toBe('ghost')
    expect(moveSelection(graph, 'ghost', 'child')).toBe('ghost')
  })
})

describe('reconcileSelection', () => {
  it('returns the id unchanged when it still exists', () => {
    const graph = graphOf([node({ id: 'a' }), node({ id: 'b' })])
    expect(reconcileSelection(graph, 'b')).toBe('b')
  })

  it('never throws', () => {
    const graph = graphOf([node({ id: 'a' })])
    expect(() => reconcileSelection(graph, 'ghost')).not.toThrow()
  })

  it('falls back to the nearest surviving ancestor when the id vanished', () => {
    // 'a' still lists 'b' in its raw childIds even though 'b' no longer has a node entry
    const graph = graphOf([node({ id: 'a', childIds: ['b'] })])
    expect(reconcileSelection(graph, 'b')).toBe('a')
  })

  it('falls back to initialSelection when no surviving ancestor is resolvable', () => {
    const graph = graphOf([node({ id: 'a', isMain: true }), node({ id: 'c' })])
    expect(reconcileSelection(graph, 'ghost')).toBe('a')
  })

  it('falls back to initialSelection when the current id is null', () => {
    const graph = graphOf([node({ id: 'a', isMain: true })])
    expect(reconcileSelection(graph, null)).toBe('a')
  })

  it('returns null for an empty graph with no resolvable id', () => {
    expect(reconcileSelection(emptyWorktreeGraph(), 'ghost')).toBeNull()
  })
})
