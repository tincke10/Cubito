import { describe, expect, it } from 'vitest'
import { resolveBaseRef } from './resolve-base-ref'
import type { WorktreeGraph, WorktreeNode } from './types'
import { emptyWorktreeGraph } from './types'
import { inertActivity } from './node-activity'

const node = (overrides: Partial<WorktreeNode> = {}): WorktreeNode => ({
  id: 'repo::/path/main',
  repoId: 'repo',
  branch: 'refs/heads/main',
  path: '/path/main',
  status: 'in-progress',
  isMain: true,
  kind: 'root',
  parentId: null,
  childIds: [],
  activity: inertActivity(),
  ...overrides
})

const graphOf = (nodes: readonly WorktreeNode[]): WorktreeGraph => {
  const graph = emptyWorktreeGraph()
  const byId = new Map(nodes.map((n) => [n.id, n]))
  return { ...graph, nodes: byId }
}

describe('resolveBaseRef', () => {
  it('prefers the node own baseRef over anything else', () => {
    const main = node({ id: 'repo::main', isMain: true, branch: 'refs/heads/main' })
    const child = node({
      id: 'repo::child',
      isMain: false,
      branch: 'refs/heads/child',
      parentId: 'repo::main',
      baseRef: 'refs/heads/explicit-base'
    })
    const graph = graphOf([main, child])
    expect(resolveBaseRef(graph, 'repo::child')).toBe('refs/heads/explicit-base')
  })

  it('falls back to the parent branch when the node has no baseRef', () => {
    const main = node({ id: 'repo::main', isMain: true, branch: 'refs/heads/main' })
    const child = node({
      id: 'repo::child',
      isMain: false,
      branch: 'refs/heads/child',
      parentId: 'repo::main'
    })
    const graph = graphOf([main, child])
    expect(resolveBaseRef(graph, 'repo::child')).toBe('refs/heads/main')
  })

  it('falls back to the repo main node branch when there is no parent', () => {
    const main = node({ id: 'repo::main', isMain: true, branch: 'refs/heads/main' })
    const orphan = node({
      id: 'repo::orphan',
      isMain: false,
      branch: 'refs/heads/orphan',
      parentId: null
    })
    const graph = graphOf([main, orphan])
    expect(resolveBaseRef(graph, 'repo::orphan')).toBe('refs/heads/main')
  })

  it('returns null when nothing resolves', () => {
    const lonely = node({
      id: 'repo::lonely',
      isMain: false,
      branch: 'refs/heads/lonely',
      parentId: null,
      repoId: 'orphan-repo'
    })
    const graph = graphOf([lonely])
    expect(resolveBaseRef(graph, 'repo::lonely')).toBeNull()
  })

  it('returns null for a node id not present in the graph', () => {
    const graph = graphOf([])
    expect(resolveBaseRef(graph, 'repo::ghost')).toBeNull()
  })

  it('does not use the main branch of a different repo', () => {
    const otherMain = node({
      id: 'other::main',
      repoId: 'other-repo',
      isMain: true,
      branch: 'refs/heads/main'
    })
    const target = node({
      id: 'repo::target',
      repoId: 'repo',
      isMain: false,
      branch: 'refs/heads/target',
      parentId: null
    })
    const graph = graphOf([otherMain, target])
    expect(resolveBaseRef(graph, 'repo::target')).toBeNull()
  })
})
