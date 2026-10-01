import type {
  GitCommitResult,
  GitStagingArea,
  RuntimeGateway,
  SourceControlStatus
} from '../../application/ports/runtime-gateway'
import type { RpcCaller } from './orcad-gateway'

export type GitWriteMethods = Pick<
  RuntimeGateway,
  'gitSourceControlStatus' | 'gitStage' | 'gitUnstage' | 'gitCommit' | 'gitPush'
>

const AREAS: readonly unknown[] = ['staged', 'unstaged', 'untracked']

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function toSourceControlStatus(result: unknown): SourceControlStatus {
  const raw = isRecord(result) ? result : {}
  const upstream = isRecord(raw.upstreamStatus) ? raw.upstreamStatus : {}
  const entries = Array.isArray(raw.entries) ? raw.entries : []
  return {
    branch: typeof raw.branch === 'string' ? raw.branch : '',
    entries: entries.flatMap((entry) =>
      isRecord(entry) && typeof entry.path === 'string' && AREAS.includes(entry.area)
        ? [{ path: entry.path, area: entry.area as GitStagingArea }]
        : []
    ),
    hasUpstream: upstream.hasUpstream === true,
    ahead: typeof upstream.ahead === 'number' ? upstream.ahead : 0,
    behind: typeof upstream.behind === 'number' ? upstream.behind : 0
  }
}

function toCommitResult(result: unknown): GitCommitResult {
  const raw = isRecord(result) ? result : {}
  if (raw.success === true) return { success: true }
  return { success: false, error: typeof raw.error === 'string' ? raw.error : 'commit failed' }
}

/** git.* write gateway (stage/commit/push), its own module because orcad-gateway.ts is at its max-lines budget. */
export function createGitWriteMethods(connection: { call: RpcCaller }): GitWriteMethods {
  return {
    async gitSourceControlStatus(worktree) {
      const response = await connection.call('git.status', { worktree })
      return toSourceControlStatus(response.result)
    },
    async gitStage(worktree, paths) {
      if (paths.length === 0) return
      await connection.call('git.bulkStage', { worktree, filePaths: [...paths] })
    },
    async gitUnstage(worktree, paths) {
      if (paths.length === 0) return
      await connection.call('git.bulkUnstage', { worktree, filePaths: [...paths] })
    },
    async gitCommit(worktree, message) {
      const response = await connection.call('git.commit', { worktree, message })
      return toCommitResult(response.result)
    },
    async gitPush(worktree, options = {}) {
      await connection.call('git.push', {
        worktree,
        ...(options.publish === true ? { publish: true } : {})
      })
    }
  }
}
