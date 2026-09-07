import {
  isUnsupportedMergeTreeMergeBaseError,
  isUnsupportedMergeTreeWriteTreeError
} from '../../shared/git-merge-tree-capability'
import { withLocalGitCapabilityCacheForExecution } from './git-capability-state'
import { gitExecFileAsync } from './runner'

export type MergeTreeExecOptions = {
  wslDistro?: string
  signal?: AbortSignal
}

export type MergeTreeWriteTreeResult = {
  treeOid: string
  conflictedFiles: string[]
}

/**
 * Runs `git merge-tree --write-tree` and returns both the resulting tree OID
 * (field[0] of the -z output) and the conflicted-file list. Shared by the
 * read-only PR conflict summary and the headless winner-merge op.
 */
export async function mergeTreeWriteTree(
  repoPath: string,
  mergeBase: string,
  headOid: string,
  baseOid: string,
  options: MergeTreeExecOptions = {}
): Promise<MergeTreeWriteTreeResult> {
  const modernArgs = [
    'merge-tree',
    '--write-tree',
    '--name-only',
    '-z',
    '--no-messages',
    '--merge-base',
    mergeBase,
    headOid,
    baseOid
  ]
  const legacyArgs = [
    'merge-tree',
    '--write-tree',
    '--name-only',
    '-z',
    '--no-messages',
    headOid,
    baseOid
  ]

  return withLocalGitCapabilityCacheForExecution(
    { cwd: repoPath, wslDistro: options.wslDistro, signal: options.signal },
    (capabilities) =>
      capabilities.runWithFallback(
        'merge-tree-write-tree',
        () =>
          capabilities.runWithFallback(
            'merge-tree-merge-base',
            () => runMergeTree(repoPath, modernArgs, options),
            () => runMergeTree(repoPath, legacyArgs, options),
            isUnsupportedMergeTreeMergeBaseError
          ),
        async () => {
          // Why: Git before 2.38 cannot derive a reliable real-merge tree/conflict
          // list; fail closed without respawning the same rejected command every call.
          throw new Error('Git merge-tree --write-tree is unavailable on this execution host.')
        },
        isUnsupportedMergeTreeWriteTreeError
      )
  )
}

async function runMergeTree(
  repoPath: string,
  args: string[],
  options: MergeTreeExecOptions
): Promise<MergeTreeWriteTreeResult> {
  try {
    const result = await gitExecFileAsync(args, {
      cwd: repoPath,
      ...(options.wslDistro ? { wslDistro: options.wslDistro } : {}),
      ...(options.signal ? { signal: options.signal } : {})
    })
    return parseMergeTreeWriteTreeOutput(result.stdout)
  } catch (error) {
    if (isUnsupportedMergeTreeWriteTreeError(error)) {
      throw error
    }
    // Why: `git merge-tree --write-tree` exits 1 for conflicts but still
    // writes the useful tree OID + file list; only option rejection reaches fallback.
    const stdoutFromError = getGitErrorOutput(error, 'stdout')
    if (stdoutFromError) {
      return parseMergeTreeWriteTreeOutput(stdoutFromError)
    }
    throw error
  }
}

function parseMergeTreeWriteTreeOutput(stdout: string): MergeTreeWriteTreeResult {
  const entries = stdout.split('\0').filter(Boolean)
  if (entries.length === 0) {
    return { treeOid: '', conflictedFiles: [] }
  }
  const [treeOid, ...conflictedFiles] = entries
  return { treeOid, conflictedFiles }
}

function getGitErrorOutput(error: unknown, key: 'stdout' | 'stderr'): string {
  if (typeof error !== 'object' || error === null) {
    return ''
  }
  const output = (error as Partial<Record<'stdout' | 'stderr', unknown>>)[key]
  return typeof output === 'string' ? output : ''
}
