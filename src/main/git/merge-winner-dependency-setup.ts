import type { Repo } from '../../shared/repo-types'
import { runHook } from '../hooks'
import { getEffectiveSetupRunPolicy } from '../effective-hook-config'
import type { GitRuntimeOptions } from './git-runtime-options'
import { gitOptionsForWorktree } from './git-runtime-options'
import type { ParentWorkingTreeSyncResult } from './merge-winner-sync'
import { gitExecFileAsync } from './runner'

/** The parent's setup hook was kicked off in the background; absent when it did not apply. */
export type ParentDependencySetupResult = { status: 'started' }

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

type SetupRunner = (
  repo: Repo,
  cwd: string,
  options: GitRuntimeOptions
) => Promise<{ success: boolean; output: string }>

// Why: the winner is agent-authored, so post-merge orca.yaml must never pick the command; only the pre-merge local setting is trusted.
const defaultSetupRunner: SetupRunner = (repo, cwd, options) =>
  runHook(
    'setup',
    cwd,
    { ...repo, hookSettings: { ...repo.hookSettings!, commandSourcePolicy: 'local-only' } },
    cwd,
    options
  )

/**
 * After a synced winner merge, starts the repo's locally configured setup hook in the parent in the
 * background so installed dependencies match the merged manifests. Never throws, never awaits the
 * hook (it outlives the RPC timeout), and never runs unless dependency files changed, the working
 * tree really synced, and the repo opted into run-by-default setup.
 */
export async function startParentDependencySetupAfterMerge(args: {
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
      repo.hookSettings?.commandSourcePolicy === 'shared-only' ||
      !repo.hookSettings?.scripts.setup?.trim()
    ) {
      return undefined
    }
    if (!(await mergeChangedDependencyManifests(parentPath, commitOid, args.options))) {
      return undefined
    }
    void (args.runSetup ?? defaultSetupRunner)(repo, parentPath, args.options ?? {})
      .then((result) => {
        if (!result.success) {
          console.error(`[hooks] parent dependency setup failed in ${parentPath}:`, result.output)
        }
      })
      .catch((error: unknown) => {
        console.error(`[hooks] parent dependency setup failed in ${parentPath}:`, error)
      })
    return { status: 'started' }
  } catch (error) {
    console.error(`[hooks] parent dependency setup skipped in ${parentPath}:`, error)
    return undefined
  }
}
