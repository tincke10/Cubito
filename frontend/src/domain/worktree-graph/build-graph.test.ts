import { describe, expect, it } from 'vitest'
import { buildWorktreeGraph } from './build-graph'
import type { RawWorktreeRecord } from './build-graph'
import { inertActivity } from './node-activity'
import type { AgentStatus, DiffSummary, NodeActivity, SpawnProgress } from './node-activity'

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

  it('gives a node with no optional activity fields the inert default', () => {
    const graph = buildWorktreeGraph([record()])
    const node = graph.nodes.get('repo::/path/main')
    expect(node?.activity).toEqual(inertActivity())
  })

  it.each<[string, Partial<RawWorktreeRecord>, Partial<NodeActivity>]>([
    ['agentStatus', { agentStatus: 'working' satisfies AgentStatus }, { agentStatus: 'working' }],
    ['isUnread', { isUnread: true }, { isUnread: true }],
    ['lastActivityAt', { lastActivityAt: 12345 }, { lastActivityAt: 12345 }],
    ['isArchived', { isArchived: true }, { isArchived: true }],
    [
      'diff',
      { diff: { added: 3, removed: 1 } satisfies DiffSummary },
      { diff: { added: 3, removed: 1 } }
    ],
    [
      'spawn',
      { spawn: { phase: 'cloning', progress: 0.3 } satisfies SpawnProgress },
      { spawn: { phase: 'cloning', progress: 0.3 } }
    ]
  ])(
    'maps the optional %s field onto activity, leaving the rest inert',
    (_field, overrides, expectedDiff) => {
      const graph = buildWorktreeGraph([record(overrides)])
      const activity = graph.nodes.get('repo::/path/main')?.activity
      expect(activity).toEqual({ ...inertActivity(), ...expectedDiff })
      expect(activity).not.toEqual(inertActivity())
    }
  )

  it.each<[boolean, 'root' | 'worktree']>([
    [true, 'root'],
    [false, 'worktree']
  ])('derives kind %s -> %s from isMain', (isMain, expectedKind) => {
    const graph = buildWorktreeGraph([
      record({ git: { path: '/path/main', isMainWorktree: isMain } })
    ])
    expect(graph.nodes.get('repo::/path/main')?.kind).toBe(expectedKind)
  })

  it('never produces a node with an undefined activity', () => {
    const graph = buildWorktreeGraph([
      record(),
      record({ id: 'repo::/b', git: { path: '/b', isMainWorktree: false } })
    ])
    for (const node of graph.nodes.values()) {
      expect(node.activity).toBeDefined()
    }
  })

  it('carries repoId from the record when present', () => {
    const graph = buildWorktreeGraph([record({ repoId: 'explicit-repo' })])
    expect(graph.nodes.get('repo::/path/main')?.repoId).toBe('explicit-repo')
  })

  it('falls back to the id prefix when repoId is absent', () => {
    const graph = buildWorktreeGraph([record({ id: 'fallback-repo::/path/main' })])
    expect(graph.nodes.get('fallback-repo::/path/main')?.repoId).toBe('fallback-repo')
  })
})
