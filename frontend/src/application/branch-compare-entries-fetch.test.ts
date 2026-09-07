import { describe, expect, it } from 'vitest'
import { fetchBranchCompareEntries } from './branch-compare-entries-fetch'
import type { BranchCompareEntriesGateway } from './branch-compare-entries-fetch'
import type { BranchCompare } from './ports/runtime-gateway'
import type { WorktreeGraph, WorktreeNode } from '../domain/worktree-graph/types'
import { emptyWorktreeGraph } from '../domain/worktree-graph/types'
import { inertActivity } from '../domain/worktree-graph/node-activity'

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

const branchCompare = (overrides: Partial<BranchCompare> = {}): BranchCompare => ({
  changedFiles: 1,
  commitsAhead: 1,
  commitsBehind: 0,
  baseRef: 'refs/heads/main',
  headOid: 'head-oid',
  mergeBase: 'merge-base',
  status: 'ready',
  entries: [{ path: 'src/a.ts', status: 'modified', added: 3, removed: 1 }],
  ...overrides
})

type FakeGateway = BranchCompareEntriesGateway & {
  calls: Array<{ worktree: string; baseRef: string }>
  impl?: (worktree: string, baseRef: string) => Promise<BranchCompare>
}

function createFakeGateway(): FakeGateway {
  const gw: FakeGateway = {
    calls: [],
    gitBranchCompare: async (worktree, baseRef) => {
      gw.calls.push({ worktree, baseRef })
      if (gw.impl) return gw.impl(worktree, baseRef)
      return branchCompare()
    }
  }
  return gw
}

describe('fetchBranchCompareEntries', () => {
  it('returns no-base-ref when resolveBaseRef cannot resolve, without calling gitBranchCompare', async () => {
    const lonely = node({
      id: 'repo::lonely',
      isMain: false,
      branch: 'refs/heads/lonely',
      parentId: null,
      repoId: 'orphan-repo'
    })
    const gateway = createFakeGateway()

    const result = await fetchBranchCompareEntries(gateway, graphOf([lonely]), 'repo::lonely')

    expect(result).toEqual({ outcome: 'no-base-ref' })
    expect(gateway.calls.length).toBe(0)
  })

  it('passes the resolved base ref to gitBranchCompare', async () => {
    const main = node({ id: 'repo::main', isMain: true, branch: 'refs/heads/main' })
    const child = node({
      id: 'repo::child',
      isMain: false,
      branch: 'refs/heads/child',
      parentId: 'repo::main'
    })
    const gateway = createFakeGateway()

    await fetchBranchCompareEntries(gateway, graphOf([main, child]), 'repo::child')

    expect(gateway.calls).toEqual([{ worktree: 'repo::child', baseRef: 'refs/heads/main' }])
  })

  it('returns ready with entries and compare {mergeBase, headOid}', async () => {
    const main = node({ id: 'repo::main', isMain: true, branch: 'refs/heads/main' })
    const child = node({
      id: 'repo::child',
      isMain: false,
      branch: 'refs/heads/child',
      parentId: 'repo::main'
    })
    const gateway = createFakeGateway()

    const result = await fetchBranchCompareEntries(gateway, graphOf([main, child]), 'repo::child')

    expect(result).toEqual({
      outcome: 'ready',
      compare: { mergeBase: 'merge-base', headOid: 'head-oid' },
      entries: [{ path: 'src/a.ts', status: 'modified', added: 3, removed: 1 }]
    })
  })

  it.each(['invalid-base', 'unborn-head', 'no-merge-base'])(
    'returns not-ready for status %s, never throwing',
    async (status) => {
      const main = node({ id: 'repo::main', isMain: true, branch: 'refs/heads/main' })
      const child = node({
        id: 'repo::child',
        isMain: false,
        branch: 'refs/heads/child',
        parentId: 'repo::main'
      })
      const gateway = createFakeGateway()
      gateway.impl = async () => branchCompare({ status, entries: [] })

      const result = await fetchBranchCompareEntries(gateway, graphOf([main, child]), 'repo::child')

      expect(result).toEqual({ outcome: 'not-ready', status })
    }
  )

  it('returns failed instead of throwing when the gateway rejects', async () => {
    const main = node({ id: 'repo::main', isMain: true, branch: 'refs/heads/main' })
    const child = node({
      id: 'repo::child',
      isMain: false,
      branch: 'refs/heads/child',
      parentId: 'repo::main'
    })
    const gateway = createFakeGateway()
    gateway.impl = () => Promise.reject(new Error('boom'))

    const result = await fetchBranchCompareEntries(gateway, graphOf([main, child]), 'repo::child')

    expect(result).toEqual({ outcome: 'failed', message: 'boom' })
  })
})
