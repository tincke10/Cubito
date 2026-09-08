import {
  resolveCompareRef,
  resolveMergeBase,
  resolveRefOid
} from './source-control/compare-ref-oids'
import type { GitRuntimeOptions } from './git-runtime-options'
import { gitOptionsForWorktree } from './git-runtime-options'
import { mergeTreeWriteTree } from './merge-tree-write-tree'
import type { ParentWorkingTreeSyncResult } from './merge-winner-sync'
import { syncParentWorkingTree } from './merge-winner-sync'
import { gitExecFileAsync } from './runner'
import { runWithGitReadCacheInvalidation } from './status'
import { runWithGitWorktreeOperationLock } from '../../shared/git-worktree-operation-lock'

export type MergeWinnerOptions = GitRuntimeOptions & { syncWorkingTree?: boolean }

export type MergeWinnerResult =
  | { outcome: 'clean'; commitOid: string; workingTree?: ParentWorkingTreeSyncResult }
  | { outcome: 'conflict'; files: string[] }

/**
 * Headless-merges the winner branch tip into the parent branch tip. Sibling
 * worktrees share one object DB, so winnerTip is reachable from parentPath.
 * Conflict -> zero mutation. Clean -> 2-parent commit-tree + a guarded
 * update-ref move of the parent branch, under the worktree op lock.
 */
export async function mergeWinnerIntoParent(
  parentPath: string,
  winnerPath: string,
  message: string,
  options: MergeWinnerOptions = {}
): Promise<MergeWinnerResult> {
  const parentBranch = await resolveCompareRef(parentPath, options)
  const parentTip = await resolveRefOid(parentPath, 'HEAD', options)
  const winnerTip = await resolveRefOid(winnerPath, 'HEAD', options)
  const mergeBase = await resolveMergeBase(parentPath, parentTip, winnerTip, options)

  const { treeOid, conflictedFiles } = await mergeTreeWriteTree(
    parentPath,
    mergeBase,
    parentTip,
    winnerTip,
    options
  )
  if (conflictedFiles.length > 0) {
    return { outcome: 'conflict', files: conflictedFiles }
  }

  return runWithGitWorktreeOperationLock(parentPath, options.signal, () =>
    runWithGitReadCacheInvalidation(() =>
      commitAndMoveParentBranch(
        parentPath,
        parentBranch,
        treeOid,
        parentTip,
        winnerTip,
        message,
        options
      )
    )
  )
}

async function commitAndMoveParentBranch(
  parentPath: string,
  parentBranch: string,
  treeOid: string,
  parentTip: string,
  winnerTip: string,
  message: string,
  options: MergeWinnerOptions
): Promise<MergeWinnerResult> {
  const { stdout } = await gitExecFileAsync(
    ['commit-tree', treeOid, '-p', parentTip, '-p', winnerTip, '-m', message],
    gitOptionsForWorktree(parentPath, options)
  )
  const commitOid = stdout.trim()
  // Why: old-value guard makes the ref move fail loudly if parentTip moved underneath us.
  await gitExecFileAsync(
    ['update-ref', `refs/heads/${parentBranch}`, commitOid, parentTip],
    gitOptionsForWorktree(parentPath, options)
  )
  if (!options.syncWorkingTree) {
    return { outcome: 'clean', commitOid }
  }
  const workingTree = await syncParentWorkingTree(parentPath, parentTip, treeOid, options)
  return { outcome: 'clean', commitOid, workingTree }
}
