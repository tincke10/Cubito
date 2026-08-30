import { describe, expect, it } from 'vitest'
import { buildWorktreeGraph } from './build-graph'
import type { RawWorktreeRecord } from './build-graph'

const record = (overrides: Partial<RawWorktreeRecord> = {}): RawWorktreeRecord => ({
  id: 'repo::/path/main',
  branch: 'refs/heads/main',
  parentWorktreeId: null,
  childWorktreeIds: [],
  workspaceStatus: 'in-progress',
  git: { path: '/path/main', isMainWorktree: true },
  ...overrides
})

describe('buildWorktreeGraph', () => {
  it('returns an empty graph for no records', () => {
    const graph = buildWorktreeGraph([])
    expect(graph.nodes.size).toBe(0)
    expect(graph.edges).toEqual([])
  })

  it('maps a record into a node with its identity fields', () => {
    const graph = buildWorktreeGraph([record()])
    const node = graph.nodes.get('repo::/path/main')
    expect(node).toBeDefined()
    expect(node?.branch).toBe('refs/heads/main')
    expect(node?.path).toBe('/path/main')
    expect(node?.isMain).toBe(true)
    expect(node?.parentId).toBeNull()
  })

  it('creates a parent-to-child edge from lineage', () => {
    const parent = record({ id: 'repo::/a', git: { path: '/a', isMainWorktree: false } })
    const child = record({
      id: 'repo::/b',
      parentWorktreeId: 'repo::/a',
      git: { path: '/b', isMainWorktree: false }
    })
    const graph = buildWorktreeGraph([parent, child])
    expect(graph.edges).toEqual([{ from: 'repo::/a', to: 'repo::/b' }])
    expect(graph.nodes.get('repo::/b')?.parentId).toBe('repo::/a')
  })

  it('drops an edge whose parent is not in the record set', () => {
    const orphan = record({ id: 'repo::/x', parentWorktreeId: 'repo::/ghost' })
    const graph = buildWorktreeGraph([orphan])
    expect(graph.edges).toEqual([])
    expect(graph.nodes.get('repo::/x')?.parentId).toBeNull()
  })

  it('deduplicates records sharing an id, keeping the first', () => {
    const first = record({ branch: 'refs/heads/one' })
    const dup = record({ branch: 'refs/heads/two' })
    const graph = buildWorktreeGraph([first, dup])
    expect(graph.nodes.size).toBe(1)
    expect(graph.nodes.get('repo::/path/main')?.branch).toBe('refs/heads/one')
  })

  it('lists roots (nodes without a resolvable parent) in insertion order', () => {
    const rootA = record({ id: 'repo::/a', git: { path: '/a', isMainWorktree: true } })
    const rootB = record({ id: 'repo::/b', git: { path: '/b', isMainWorktree: false } })
    const child = record({
      id: 'repo::/c',
      parentWorktreeId: 'repo::/b',
      git: { path: '/c', isMainWorktree: false }
    })
    const graph = buildWorktreeGraph([rootA, rootB, child])
    expect(graph.rootIds).toEqual(['repo::/a', 'repo::/b'])
  })
})
