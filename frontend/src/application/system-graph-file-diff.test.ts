import { describe, expect, it } from 'vitest'
import {
  applyFileDiffToSystemGraph,
  normalizeSystemFilePath,
  systemGraphFileSetKey,
  systemNodeFilePath
} from './system-graph-file-diff'
import { buildSystemGraph } from '../domain/system-graph/build-system-graph'
import type { SystemGraph, SystemNode } from '../domain/system-graph/types'
import { systemHudCounts } from './system-view-model'
import type { GitStatusRow } from './ports/runtime-gateway'

const routerNode = (overrides: Partial<SystemNode> = {}): SystemNode => ({
  id: 'router:src/routes/users.ts',
  kind: 'router',
  label: 'src/routes/users.ts',
  state: 'idle',
  diff: null,
  ...overrides
})

const endpointNode = (overrides: Partial<SystemNode> = {}): SystemNode => ({
  id: 'endpoint:src/routes/users.ts#0',
  kind: 'endpoint',
  label: 'GET /users',
  method: 'GET',
  path: '/users',
  state: 'idle',
  diff: null,
  ...overrides
})

const entry = (overrides: Partial<GitStatusRow> = {}): GitStatusRow => ({
  path: 'src/routes/users.ts',
  status: 'modified',
  added: 0,
  removed: 0,
  ...overrides
})

describe('systemNodeFilePath', () => {
  it('extracts the file path from a router id', () => {
    expect(systemNodeFilePath('router:src/routes/users.ts')).toBe('src/routes/users.ts')
  })

  it('extracts the file path from an endpoint id, splitting at the LAST #', () => {
    expect(systemNodeFilePath('endpoint:src/routes/users.ts#0')).toBe('src/routes/users.ts')
    expect(systemNodeFilePath('endpoint:src/rou#tes/a.ts#12')).toBe('src/rou#tes/a.ts')
  })

  it('returns null for an endpoint id with no #', () => {
    expect(systemNodeFilePath('endpoint:src/routes/users.ts')).toBeNull()
  })

  it('returns null for service and database ids', () => {
    expect(systemNodeFilePath('service:user.service')).toBeNull()
    expect(systemNodeFilePath('database:postgres')).toBeNull()
  })
})

describe('normalizeSystemFilePath', () => {
  it('rewrites backslashes to forward slashes', () => {
    expect(normalizeSystemFilePath('src\\routes\\users.ts')).toBe('src/routes/users.ts')
  })

  it('strips a leading ./, including repeated occurrences', () => {
    expect(normalizeSystemFilePath('./src/a.ts')).toBe('src/a.ts')
    expect(normalizeSystemFilePath('././src/a.ts')).toBe('src/a.ts')
  })

  it('leaves a leading / intact', () => {
    expect(normalizeSystemFilePath('/src/a.ts')).toBe('/src/a.ts')
  })
})

describe('applyFileDiffToSystemGraph', () => {
  function headlineGraph(): SystemGraph {
    return buildSystemGraph({
      nodes: [
        routerNode({ id: 'router:src/routes/users.ts', label: 'src/routes/users.ts' }),
        endpointNode({ id: 'endpoint:src/routes/users.ts#0' }),
        endpointNode({ id: 'endpoint:src/routes/users.ts#1' }),
        routerNode({ id: 'router:src/routes/auth.ts', label: 'src/routes/auth.ts' }),
        endpointNode({ id: 'endpoint:src/routes/auth.ts#0' }),
        {
          id: 'service:user.service',
          kind: 'service',
          label: 'user.service',
          state: 'idle',
          diff: null
        },
        { id: 'database:postgres', kind: 'database', label: 'postgres', state: 'idle', diff: null }
      ],
      edges: []
    })
  }

  const headlineEntries: readonly GitStatusRow[] = [
    entry({ path: 'src/routes/users.ts', status: 'modified', added: 34, removed: 8 }),
    entry({ path: 'src/routes/auth.ts', status: 'added', added: 21, removed: 0 })
  ]

  it('joins realistic engine ids against realistic git entries', () => {
    const { graph, matchedFileCount } = applyFileDiffToSystemGraph(headlineGraph(), headlineEntries)

    expect(matchedFileCount).toBe(2)
    expect(graph.nodes.get('router:src/routes/users.ts')).toMatchObject({
      state: 'dirty',
      diff: { added: 34, removed: 8 }
    })
    expect(graph.nodes.get('endpoint:src/routes/users.ts#0')).toMatchObject({
      state: 'dirty',
      diff: null
    })
    expect(graph.nodes.get('endpoint:src/routes/users.ts#1')).toMatchObject({
      state: 'dirty',
      diff: null
    })
    expect(graph.nodes.get('router:src/routes/auth.ts')).toMatchObject({
      state: 'naciendo',
      diff: { added: 21, removed: 0 }
    })
    expect(graph.nodes.get('endpoint:src/routes/auth.ts#0')).toMatchObject({
      state: 'naciendo',
      diff: null
    })
    expect(graph.nodes.get('service:user.service')).toMatchObject({ state: 'idle', diff: null })
    expect(graph.nodes.get('database:postgres')).toMatchObject({ state: 'idle', diff: null })
  })

  it('reports matchedFileCount 0 when entry paths do not line up (absolute paths)', () => {
    const entries = [
      entry({ path: '/abs/src/routes/users.ts' }),
      entry({ path: '/abs/src/routes/auth.ts' })
    ]

    const { graph, matchedFileCount } = applyFileDiffToSystemGraph(headlineGraph(), entries)

    expect(matchedFileCount).toBe(0)
    for (const node of graph.nodes.values()) {
      if (node.kind === 'router' || node.kind === 'endpoint') {
        expect(node.state).toBe('idle')
        expect(node.diff).toBeNull()
      }
    }
  })

  it('matches a Windows-separator entry path', () => {
    const entries = [
      entry({ path: 'src\\routes\\users.ts', status: 'modified', added: 5, removed: 1 })
    ]

    const { graph, matchedFileCount } = applyFileDiffToSystemGraph(headlineGraph(), entries)

    expect(matchedFileCount).toBe(1)
    expect(graph.nodes.get('router:src/routes/users.ts')).toMatchObject({
      state: 'dirty',
      diff: { added: 5, removed: 1 }
    })
  })

  it('matches a leading ./ entry path', () => {
    const entries = [
      entry({ path: './src/routes/users.ts', status: 'modified', added: 2, removed: 2 })
    ]

    const { matchedFileCount } = applyFileDiffToSystemGraph(headlineGraph(), entries)

    expect(matchedFileCount).toBe(1)
  })

  it.each([
    ['modified', 'dirty'],
    ['renamed', 'dirty'],
    ['added', 'naciendo'],
    ['copied', 'naciendo']
  ])('maps status %s to state %s', (status, expectedState) => {
    const entries = [entry({ status })]

    const { graph } = applyFileDiffToSystemGraph(headlineGraph(), entries)

    expect(graph.nodes.get('router:src/routes/users.ts')?.state).toBe(expectedState)
  })

  it('a deleted entry with no matching node does not throw and matches nothing', () => {
    const entries = [entry({ path: 'src/routes/gone.ts', status: 'deleted' })]

    expect(() => applyFileDiffToSystemGraph(headlineGraph(), entries)).not.toThrow()
    const { matchedFileCount } = applyFileDiffToSystemGraph(headlineGraph(), entries)
    expect(matchedFileCount).toBe(0)
  })

  it('a deleted entry for a file that DOES have a node leaves it idle/null', () => {
    const entries = [entry({ path: 'src/routes/users.ts', status: 'deleted' })]

    const { graph } = applyFileDiffToSystemGraph(headlineGraph(), entries)

    expect(graph.nodes.get('router:src/routes/users.ts')).toMatchObject({
      state: 'idle',
      diff: null
    })
  })

  it('never produces the editing state', () => {
    const statuses = ['modified', 'added', 'deleted', 'renamed', 'copied', 'untracked']
    for (const status of statuses) {
      const { graph } = applyFileDiffToSystemGraph(headlineGraph(), [entry({ status })])
      for (const node of graph.nodes.values()) {
        expect(node.state).not.toBe('editing')
      }
    }
  })

  it('leaves unmatched nodes untouched (same reference)', () => {
    const graph = headlineGraph()
    const authRouter = graph.nodes.get('router:src/routes/auth.ts')
    const { graph: joined } = applyFileDiffToSystemGraph(graph, [
      entry({ path: 'src/routes/users.ts', status: 'modified' })
    ])
    expect(joined.nodes.get('router:src/routes/auth.ts')).toBe(authRouter)
  })

  it('is pure: does not mutate the input graph or entries', () => {
    const graph = headlineGraph()
    const before = graph.nodes.get('router:src/routes/users.ts')
    const entries = [
      entry({ path: 'src/routes/users.ts', status: 'modified', added: 9, removed: 1 })
    ]
    const entriesCopy = [...entries]

    applyFileDiffToSystemGraph(graph, entries)

    expect(graph.nodes.get('router:src/routes/users.ts')).toBe(before)
    expect(entries).toEqual(entriesCopy)
  })

  it('produces HUD counts of tocados 2, nuevo 1 for the headline join', () => {
    const { graph } = applyFileDiffToSystemGraph(headlineGraph(), headlineEntries)
    const counts = systemHudCounts({ view: 'open', focusedNodeId: 'w', graph, feed: [] })
    expect(counts).toEqual({ tocados: 2, nuevo: 1 })
  })
})

describe('systemGraphFileSetKey', () => {
  function graphWith(nodes: readonly SystemNode[]): SystemGraph {
    return buildSystemGraph({ nodes, edges: [] })
  }

  it('is stable across node insertion order', () => {
    const a = graphWith([
      routerNode({ id: 'router:src/a.ts', label: 'src/a.ts' }),
      routerNode({ id: 'router:src/b.ts', label: 'src/b.ts' })
    ])
    const b = graphWith([
      routerNode({ id: 'router:src/b.ts', label: 'src/b.ts' }),
      routerNode({ id: 'router:src/a.ts', label: 'src/a.ts' })
    ])
    expect(systemGraphFileSetKey(a)).toBe(systemGraphFileSetKey(b))
  })

  it('changes when a file appears or disappears', () => {
    const before = graphWith([routerNode({ id: 'router:src/a.ts', label: 'src/a.ts' })])
    const after = graphWith([
      routerNode({ id: 'router:src/a.ts', label: 'src/a.ts' }),
      routerNode({ id: 'router:src/b.ts', label: 'src/b.ts' })
    ])
    expect(systemGraphFileSetKey(before)).not.toBe(systemGraphFileSetKey(after))
  })

  it('ignores service and database nodes', () => {
    const withExtras = graphWith([
      routerNode({ id: 'router:src/a.ts', label: 'src/a.ts' }),
      { id: 'service:x', kind: 'service', label: 'x', state: 'idle', diff: null },
      { id: 'database:y', kind: 'database', label: 'y', state: 'idle', diff: null }
    ])
    const withoutExtras = graphWith([routerNode({ id: 'router:src/a.ts', label: 'src/a.ts' })])
    expect(systemGraphFileSetKey(withExtras)).toBe(systemGraphFileSetKey(withoutExtras))
  })
})
