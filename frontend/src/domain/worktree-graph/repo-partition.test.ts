import { describe, expect, it } from 'vitest'
import { partitionGraphByRepo } from './repo-partition'
import type { WorktreeGraph, WorktreeNode } from './types'
import { emptyWorktreeGraph } from './types'
import { inertActivity } from './node-activity'

const node = (id: string, repoId: string, overrides: Partial<WorktreeNode> = {}): WorktreeNode => ({
  id,
  repoId,
  branch: `refs/heads/${id}`,
  path: `/path/${id}`,
  status: 'in-progress',
  isMain: false,
  kind: 'worktree',
  parentId: null,
  childIds: [],
  activity: inertActivity(),
  ...overrides
})

const graphOf = (
  nodes: readonly WorktreeNode[],
  edges: WorktreeGraph['edges'] = []
): WorktreeGraph => ({
  nodes: new Map(nodes.map((n) => [n.id, n])),
  edges,
  rootIds: nodes.filter((n) => n.parentId === null).map((n) => n.id)
})

describe('partitionGraphByRepo', () => {
  it('returns an empty map for an empty graph', () => {
    expect(partitionGraphByRepo(emptyWorktreeGraph()).size).toBe(0)
  })

  it('puts every node of a single-repo graph into one partition keyed by its repoId', () => {
    const graph = graphOf([
      node('r::/a', 'r', { isMain: true }),
      node('r::/b', 'r', { parentId: 'r::/a' })
    ])
    const partitions = partitionGraphByRepo(graph)
    expect(partitions.size).toBe(1)
    const only = partitions.get('r')
    expect(only?.nodes.size).toBe(2)
    expect(only?.rootIds).toEqual(['r::/a'])
  })

  it('groups nodes into separate partitions per repoId, with no cross-bleeding', () => {
    const graph = graphOf([
      node('a::/1', 'a', { isMain: true }),
      node('a::/2', 'a', { parentId: 'a::/1' }),
      node('b::/1', 'b', { isMain: true })
    ])
    const partitions = partitionGraphByRepo(graph)
    expect([...partitions.keys()].sort()).toEqual(['a', 'b'])
    expect(partitions.get('a')?.nodes.size).toBe(2)
    expect(partitions.get('b')?.nodes.size).toBe(1)
    expect(partitions.get('b')?.nodes.has('a::/1')).toBe(false)
  })

  it('keeps only same-repo edges within a partition', () => {
    const graph = graphOf(
      [
        node('a::/1', 'a', { isMain: true, childIds: ['a::/2'] }),
        node('a::/2', 'a', { parentId: 'a::/1' })
      ],
      [{ from: 'a::/1', to: 'a::/2' }]
    )
    const partitions = partitionGraphByRepo(graph)
    expect(partitions.get('a')?.edges).toEqual([{ from: 'a::/1', to: 'a::/2' }])
  })
})
