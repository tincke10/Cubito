import type { GitStatusRow, RuntimeGateway } from './ports/runtime-gateway'

/** Only the method a working-tree fetch needs — narrow like branch-compare-entries-fetch. */
export type WorkingTreeEntriesGateway = Pick<RuntimeGateway, 'gitStatus'>

export type WorkingTreeEntriesResult =
  | { outcome: 'ready'; entries: readonly GitStatusRow[] }
  | { outcome: 'failed'; message: string }

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** Precedence when git.status reports the same path twice (staged + unstaged areas). */
const STATUS_PRECEDENCE = ['added', 'untracked', 'copied', 'renamed', 'modified'] as const

function rankOf(status: string): number {
  const index = STATUS_PRECEDENCE.indexOf(status as (typeof STATUS_PRECEDENCE)[number])
  return index === -1 ? STATUS_PRECEDENCE.length : index
}

/** git.status can list one path twice (staged + unstaged); collapse it into one row. */
function collapseByPath(entries: readonly GitStatusRow[]): readonly GitStatusRow[] {
  const byPath = new Map<string, GitStatusRow>()
  for (const entry of entries) {
    const existing = byPath.get(entry.path)
    if (existing === undefined) {
      byPath.set(entry.path, entry)
      continue
    }
    byPath.set(entry.path, {
      path: entry.path,
      status: rankOf(entry.status) <= rankOf(existing.status) ? entry.status : existing.status,
      added: existing.added + entry.added,
      removed: existing.removed + entry.removed
    })
  }
  return [...byPath.values()]
}

/** Working-tree (git.status) counterpart to fetchBranchCompareEntries — never throws. */
export async function fetchWorkingTreeEntries(
  gateway: WorkingTreeEntriesGateway,
  worktree: string
): Promise<WorkingTreeEntriesResult> {
  try {
    const status = await gateway.gitStatus(worktree)
    return { outcome: 'ready', entries: collapseByPath(status.entries) }
  } catch (error) {
    return { outcome: 'failed', message: messageOf(error) }
  }
}
