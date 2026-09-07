import { resolveBaseRef } from '../domain/worktree-graph/resolve-base-ref'
import type { WorktreeGraph, WorktreeId } from '../domain/worktree-graph/types'
import type { GitStatusRow, RuntimeGateway } from './ports/runtime-gateway'

/** Only the method a branch-compare fetch needs — narrow like the other controller ports. */
export type BranchCompareEntriesGateway = Pick<RuntimeGateway, 'gitBranchCompare'>

export type BranchCompareEntriesResult =
  | {
      outcome: 'ready'
      compare: { mergeBase: string; headOid: string }
      entries: readonly GitStatusRow[]
    }
  | { outcome: 'no-base-ref' }
  | { outcome: 'not-ready'; status: string }
  | { outcome: 'failed'; message: string }

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Shared branch-compare fetch — extracted from diff-live-loader's loadRail so the system-view
 * poll can reuse the same base-ref resolution and never-throws contract without duplicating it.
 */
export async function fetchBranchCompareEntries(
  gateway: BranchCompareEntriesGateway,
  graph: WorktreeGraph,
  nodeId: WorktreeId
): Promise<BranchCompareEntriesResult> {
  const baseRef = resolveBaseRef(graph, nodeId)
  if (baseRef === null) {
    return { outcome: 'no-base-ref' }
  }
  try {
    const compare = await gateway.gitBranchCompare(nodeId, baseRef)
    if (compare.status !== 'ready') {
      return { outcome: 'not-ready', status: compare.status }
    }
    return {
      outcome: 'ready',
      compare: { mergeBase: compare.mergeBase, headOid: compare.headOid },
      entries: compare.entries
    }
  } catch (error) {
    return { outcome: 'failed', message: messageOf(error) }
  }
}
