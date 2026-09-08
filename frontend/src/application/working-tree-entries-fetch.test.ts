import { describe, expect, it } from 'vitest'
import { fetchWorkingTreeEntries } from './working-tree-entries-fetch'
import type { WorkingTreeEntriesGateway } from './working-tree-entries-fetch'
import type { GitStatus, GitStatusRow } from './ports/runtime-gateway'

const row = (overrides: Partial<GitStatusRow> = {}): GitStatusRow => ({
  path: 'src/a.ts',
  status: 'modified',
  added: 0,
  removed: 0,
  ...overrides
})

const gitStatus = (overrides: Partial<GitStatus> = {}): GitStatus => ({
  entries: [row()],
  branch: 'refs/heads/main',
  branchLineTotal: 0,
  ...overrides
})

type FakeGateway = WorkingTreeEntriesGateway & {
  calls: string[]
  impl?: (worktree: string) => Promise<GitStatus>
}

function createFakeGateway(): FakeGateway {
  const gw: FakeGateway = {
    calls: [],
    gitStatus: async (worktree) => {
      gw.calls.push(worktree)
      if (gw.impl) return gw.impl(worktree)
      return gitStatus()
    }
  }
  return gw
}

describe('fetchWorkingTreeEntries', () => {
  it('returns ready with the entries passed through', async () => {
    const gateway = createFakeGateway()
    gateway.impl = async () => gitStatus({ entries: [row({ path: 'src/a.ts', added: 3 })] })

    const result = await fetchWorkingTreeEntries(gateway, 'repo::main')

    expect(gateway.calls).toEqual(['repo::main'])
    expect(result).toEqual({ outcome: 'ready', entries: [row({ path: 'src/a.ts', added: 3 })] })
  })

  it('returns ready with an empty array when there are no entries', async () => {
    const gateway = createFakeGateway()
    gateway.impl = async () => gitStatus({ entries: [] })

    const result = await fetchWorkingTreeEntries(gateway, 'repo::main')

    expect(result).toEqual({ outcome: 'ready', entries: [] })
  })

  it('collapses a repeated path, summing added/removed', async () => {
    const gateway = createFakeGateway()
    gateway.impl = async () =>
      gitStatus({
        entries: [
          row({ path: 'src/a.ts', status: 'modified', added: 3, removed: 1 }),
          row({ path: 'src/a.ts', status: 'modified', added: 2, removed: 4 })
        ]
      })

    const result = await fetchWorkingTreeEntries(gateway, 'repo::main')

    expect(result).toEqual({
      outcome: 'ready',
      entries: [{ path: 'src/a.ts', status: 'modified', added: 5, removed: 5 }]
    })
  })

  it.each([
    ['added', 'modified', 'added'],
    ['untracked', 'modified', 'untracked'],
    ['copied', 'modified', 'copied'],
    ['renamed', 'modified', 'renamed'],
    ['modified', 'deleted', 'modified']
  ])(
    'keeps status %s over %s per the precedence order, regardless of row order',
    async (winner, loser, expectedStatus) => {
      const gateway = createFakeGateway()
      gateway.impl = async () =>
        gitStatus({
          entries: [
            row({ path: 'src/a.ts', status: loser, added: 1, removed: 0 }),
            row({ path: 'src/a.ts', status: winner, added: 1, removed: 0 })
          ]
        })

      const result = await fetchWorkingTreeEntries(gateway, 'repo::main')

      expect(result).toEqual({
        outcome: 'ready',
        entries: [{ path: 'src/a.ts', status: expectedStatus, added: 2, removed: 0 }]
      })
    }
  )

  it('returns failed instead of throwing when the gateway rejects', async () => {
    const gateway = createFakeGateway()
    gateway.impl = () => Promise.reject(new Error('boom'))

    const result = await fetchWorkingTreeEntries(gateway, 'repo::main')

    expect(result).toEqual({ outcome: 'failed', message: 'boom' })
  })
})
