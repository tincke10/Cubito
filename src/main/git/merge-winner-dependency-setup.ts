import type { Repo } from '../../shared/repo-types'
import { getEffectiveHooks, runHook } from '../hooks'
import { getEffectiveSetupRunPolicy } from '../effective-hook-config'
import type { GitRuntimeOptions } from './git-runtime-options'
import { gitOptionsForWorktree } from './git-runtime-options'
import type { ParentWorkingTreeSyncResult } from './merge-winner-sync'
import { gitExecFileAsync } from './runner'

/** Outcome of re-running the repo setup hook in the parent; absent when it did not apply. */
export type ParentDependencySetupResult = { status: 'ran' } | { status: 'failed'; message: string }

const DEPENDENCY_MANIFEST =
  /(^|\/)(package\.json|package-lock\.json|npm-shrinkwrap\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?)$/

/** True when the merge commit changed a package manifest or lockfile relative to the old parent tip. */
export async function mergeChangedDependencyManifests(
  parentPath: string,
  commitOid: string,
  options: GitRuntimeOptions = {}
): Promise<boolean> {
  const { stdout } = await gitExecFileAsync(
    ['diff', '--name-only', `${commitOid}^1`, commitOid, '--'],
    gitOptionsForWorktree(parentPath, options)
  )
  return stdout
    .split('\n')
    .map((line) => line.trim())
    .some((file) => DEPENDENCY_MANIFEST.test(file))
}

type SetupRunner = (repo: Repo, cwd: string) => Promise<{ success: boolean; output: string }>

const defaultSetupRunner: SetupRunner = (repo, cwd) => runHook('setup', cwd, repo, cwd)

/**
 * After a synced winner merge, re-runs the repo's setup hook in the parent so its installed
 * dependencies match the merged manifests. Never throws and never runs unless dependency files
 * changed, the working tree really synced, and the repo opted into run-by-default setup.
 */
export async function runParentDependencySetupAfterMerge(args: {
  repo: Repo | undefined
  parentPath: string
  commitOid: string
  workingTree: ParentWorkingTreeSyncResult | undefined
  options?: GitRuntimeOptions
  runSetup?: SetupRunner
}): Promise<ParentDependencySetupResult | undefined> {
  const { repo, parentPath, commitOid, workingTree } = args
  if (!repo || workingTree?.status !== 'synced') {
    return undefined
  }
  try {
    if (
      getEffectiveSetupRunPolicy(repo) !== 'run-by-default' ||
      !getEffectiveHooks(repo, parentPath)?.scripts.setup
    ) {
      return undefined
    }
    if (!(await mergeChangedDependencyManifests(parentPath, commitOid, args.options))) {
      return undefined
    }
    const result = await (args.runSetup ?? defaultSetupRunner)(repo, parentPath)
    return result.success
      ? { status: 'ran' }
      : { status: 'failed', message: result.output || 'setup hook failed' }
  } catch (error) {
    return { status: 'failed', message: error instanceof Error ? error.message : String(error) }
  }
}
