import type { DiffFileContent } from './ports/runtime-gateway'

/** Composes a mergeBase→worktree diff from two existing RPC results — branch's original (blob@mergeBase)
 *  plus working-tree's modified (worktree file) — for a path changed both on the branch and uncommitted. */
export function composeBaseToWorkingTree(
  branch: DiffFileContent,
  working: DiffFileContent
): DiffFileContent {
  if (branch.kind === 'binary' || working.kind === 'binary') {
    const modifiedDeleted = working.kind === 'binary' ? working.modifiedDeleted : undefined
    return {
      kind: 'binary',
      ...(modifiedDeleted === undefined ? {} : { modifiedDeleted })
    }
  }
  return {
    kind: 'text',
    originalContent: branch.originalContent,
    modifiedContent: working.modifiedContent,
    truncated: branch.truncated || working.truncated
  }
}
