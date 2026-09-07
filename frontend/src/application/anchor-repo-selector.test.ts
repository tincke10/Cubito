import { describe, expect, it } from 'vitest'
import { repoSelectorForNode } from './anchor-repo-selector'
import { emptyWorktreeGraph } from '../domain/worktree-graph/types'
import type { WorktreeGraph, WorktreeNode } from '../domain/worktree-graph/types'
import { inertActivity } from '../domain/worktree-graph/node-activity'

const node = (id: string, repoId: string): WorktreeNode => ({
  id,
  repoId,
  branch: 'refs/heads/main',
  path: `/wt/${id}`,
  status: 'in-progress',
  isMain: true,
  kind: 'root',
  parentId: null,
  childIds: [],
  activity: inertActivity()
})

const graphWith = (...nodes: WorktreeNode[]): WorktreeGraph => ({
  ...emptyWorktreeGraph(),
  nodes: new Map(nodes.map((n) => [n.id, n])),
  rootIds: nodes.map((n) => n.id)
})

describe('repoSelectorForNode', () => {
  it('builds an id: selector from the anchor node repoId', () => {
    expect(repoSelectorForNode(graphWith(node('a', 'repo-9')), 'a')).toBe('id:repo-9')
  })

  it('returns null for a null anchor (rootless spawn)', () => {
    expect(repoSelectorForNode(graphWith(node('a', 'repo-9')), null)).toBeNull()
  })

  it('returns null when the anchor is not in the graph', () => {
    expect(repoSelectorForNode(emptyWorktreeGraph(), 'ghost')).toBeNull()
  })

  it('returns null when the node carries an empty repoId', () => {
    expect(repoSelectorForNode(graphWith(node('a', '')), 'a')).toBeNull()
  })
})
