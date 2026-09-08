import type { GitRuntimeOptions } from './git-runtime-options'
import { gitOptionsForWorktree } from './git-runtime-options'
import { gitExecFileAsync } from './runner'

export type ParentWorkingTreeSyncResult =
  | { status: 'synced' }
  | { status: 'skipped'; reason: 'dirty' }
  | { status: 'failed'; message: string }

/**
 * Best-effort parent working-tree sync after a clean winner merge; caller holds the worktree
 * op lock + read-cache invalidation already. Never throws — a failure here must not roll back
 * the already-moved parent ref.
 */
export async function syncParentWorkingTree(
  parentPath: string,
  parentTip: string,
  newTreeOid: string,
  options: GitRuntimeOptions = {}
): Promise<ParentWorkingTreeSyncResult> {
  // Why: pinned to parentTip explicitly (not `git status`'s implicit HEAD) — by the time this
  // runs, the caller has already moved the parent branch ref past parentTip, so a HEAD-relative
  // check would misreport the merge's own diff as local dirtiness.
  const { stdout: trackedDiff } = await gitExecFileAsync(
    ['diff', '--name-only', parentTip, '--'],
    gitOptionsForWorktree(parentPath, options)
  )
  if (trackedDiff.trim()) {
    return { status: 'skipped', reason: 'dirty' }
  }
  try {
    // Two-tree merge: index/worktree entries unchanged since parentTip take newTreeOid's
    // version; anything locally modified (or an untracked file newTreeOid would clobber)
    // makes git refuse instead of overwriting it.
    await gitExecFileAsync(
      ['read-tree', '-u', '-m', parentTip, newTreeOid],
      gitOptionsForWorktree(parentPath, options)
    )
    return { status: 'synced' }
  } catch (error) {
    return { status: 'failed', message: error instanceof Error ? error.message : String(error) }
  }
}
