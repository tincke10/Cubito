import type { RawWorktreeRecord } from '../../domain/worktree-graph/build-graph'
import type {
  BranchCompare,
  CreateWorktreeInput,
  DiffFileContent,
  GitStatus,
  GitStatusRow,
  RepoSummary,
  RuntimeGateway,
  WorktreePsRow
} from '../../application/ports/runtime-gateway'
import type { RpcSuccessFrame } from './envelope'

/** Projects a raw `worktree.ps` row onto the local `WorktreePsRow` shape. */
function toWorktreePsRow(row: { worktreeId?: unknown; status?: unknown }): WorktreePsRow {
  return {
    worktreeId: typeof row.worktreeId === 'string' ? row.worktreeId : '',
    status: typeof row.status === 'string' ? row.status : 'inactive'
  }
}

/** Projects a raw `repo.list`/`repo.add` row onto the local `RepoSummary` shape. */
function toRepoSummary(row: {
  id?: unknown
  path?: unknown
  displayName?: unknown
  kind?: unknown
}): RepoSummary {
  if (typeof row.id !== 'string') {
    throw new Error('repo row missing an id')
  }
  return {
    id: row.id,
    path: typeof row.path === 'string' ? row.path : '',
    displayName: typeof row.displayName === 'string' ? row.displayName : row.id,
    kind: row.kind === 'git' || row.kind === 'folder' ? row.kind : null
  }
}

/** Projects a raw `git.status`/`git.branchCompare` entry onto the local `GitStatusRow` shape. */
function toGitStatusRow(row: {
  path?: unknown
  status?: unknown
  added?: unknown
  removed?: unknown
}): GitStatusRow {
  return {
    path: typeof row.path === 'string' ? row.path : '',
    status: typeof row.status === 'string' ? row.status : 'modified',
    added: typeof row.added === 'number' ? row.added : 0,
    removed: typeof row.removed === 'number' ? row.removed : 0
  }
}

/** Projects a raw `git.status` result onto the local `GitStatus` shape (per-file stats + worktree total). */
function toGitStatus(result: {
  entries?: unknown
  branch?: unknown
  branchLineTotal?: { added?: unknown; removed?: unknown }
}): GitStatus {
  const total = result.branchLineTotal
  const added = typeof total?.added === 'number' ? total.added : 0
  const removed = typeof total?.removed === 'number' ? total.removed : 0
  return {
    entries: Array.isArray(result.entries)
      ? (result.entries as Record<string, unknown>[]).map(toGitStatusRow)
      : [],
    branch: typeof result.branch === 'string' ? result.branch : '',
    branchLineTotal: added + removed
  }
}

/** Projects a raw `git.branchCompare` result onto the local `BranchCompare` shape. */
function toBranchCompare(result: {
  summary?: {
    changedFiles?: unknown
    commitsAhead?: unknown
    commitsBehind?: unknown
    baseRef?: unknown
    headOid?: unknown
    mergeBase?: unknown
    status?: unknown
  }
  entries?: unknown
}): BranchCompare {
  const summary = result.summary
  return {
    changedFiles: typeof summary?.changedFiles === 'number' ? summary.changedFiles : 0,
    commitsAhead: typeof summary?.commitsAhead === 'number' ? summary.commitsAhead : 0,
    commitsBehind: typeof summary?.commitsBehind === 'number' ? summary.commitsBehind : 0,
    baseRef: typeof summary?.baseRef === 'string' ? summary.baseRef : '',
    headOid: typeof summary?.headOid === 'string' ? summary.headOid : '',
    mergeBase: typeof summary?.mergeBase === 'string' ? summary.mergeBase : '',
    status: typeof summary?.status === 'string' ? summary.status : '',
    entries: Array.isArray(result.entries)
      ? (result.entries as Record<string, unknown>[]).map(toGitStatusRow)
      : []
  }
}

/** Projects a raw `git.branchDiff` result onto the local `DiffFileContent` shape. */
function toDiffFileContent(result: {
  kind?: unknown
  originalContent?: unknown
  modifiedContent?: unknown
  mimeType?: unknown
  modifiedDeleted?: unknown
  largeDiffRenderLimit?: { limited?: unknown }
}): DiffFileContent {
  if (result.kind === 'binary') {
    return {
      kind: 'binary',
      ...(typeof result.mimeType === 'string' ? { mimeType: result.mimeType } : {}),
      ...(typeof result.modifiedDeleted === 'boolean'
        ? { modifiedDeleted: result.modifiedDeleted }
        : {})
    }
  }
  return {
    kind: 'text',
    originalContent: typeof result.originalContent === 'string' ? result.originalContent : '',
    modifiedContent: typeof result.modifiedContent === 'string' ? result.modifiedContent : '',
    truncated: result.largeDiffRenderLimit?.limited === true
  }
}

/** The one method of RpcConnection the gateway needs; eases test doubles. */
export type RpcCaller = (method: string, params?: unknown) => Promise<RpcSuccessFrame>

export type OrcadGatewayOptions = {
  /** Surfaces `_meta.runtimeId` for the HUD, without widening the frozen RuntimeGateway port. */
  onRuntimeId?: (runtimeId: string) => void
}

export function createOrcadGateway(
  connection: { call: RpcCaller },
  options?: OrcadGatewayOptions
): RuntimeGateway {
  return {
    async listWorktrees() {
      const response = await connection.call('worktree.list')
      const result = response.result as { worktrees?: unknown }
      if (!Array.isArray(result?.worktrees)) {
        throw new Error('worktree.list returned no worktrees array')
      }
      options?.onRuntimeId?.(response._meta.runtimeId)
      return result.worktrees as RawWorktreeRecord[]
    },
    async listRepos() {
      const response = await connection.call('repo.list')
      const result = response.result as { repos?: unknown }
      if (!Array.isArray(result?.repos)) {
        throw new Error('repo.list returned no repos array')
      }
      return (result.repos as Record<string, unknown>[]).map(toRepoSummary)
    },
    async addRepo(input) {
      const response = await connection.call('repo.add', input)
      const result = response.result as { repo?: unknown }
      if (typeof result?.repo !== 'object' || result.repo === null) {
        throw new Error('repo.add returned no repo')
      }
      return toRepoSummary(result.repo as Record<string, unknown>)
    },
    async createWorktree(input: CreateWorktreeInput) {
      const response = await connection.call('worktree.create', input)
      const result = response.result as { worktree?: { id?: unknown }; warnings?: unknown }
      const worktreeId = result?.worktree?.id
      if (typeof worktreeId !== 'string') {
        throw new Error('worktree.create returned no worktree id')
      }
      return Array.isArray(result.warnings)
        ? { worktreeId, warnings: result.warnings as readonly string[] }
        : { worktreeId }
    },
    async listWorktreePs() {
      const response = await connection.call('worktree.ps')
      const result = response.result as { worktrees?: unknown }
      if (!Array.isArray(result?.worktrees)) {
        throw new Error('worktree.ps returned no worktrees array')
      }
      return (result.worktrees as Record<string, unknown>[]).map(toWorktreePsRow)
    },
    async gitStatus(worktree: string) {
      const response = await connection.call('git.status', { worktree })
      return toGitStatus(response.result as Parameters<typeof toGitStatus>[0])
    },
    async gitBranchCompare(worktree: string, baseRef: string) {
      const response = await connection.call('git.branchCompare', { worktree, baseRef })
      return toBranchCompare(response.result as Parameters<typeof toBranchCompare>[0])
    },
    async gitBranchDiff(
      worktree: string,
      compare: { mergeBase: string; headOid: string },
      filePath: string,
      oldPath?: string
    ) {
      const response = await connection.call('git.branchDiff', {
        worktree,
        compare,
        filePath,
        ...(oldPath !== undefined ? { oldPath } : {})
      })
      return toDiffFileContent(response.result as Parameters<typeof toDiffFileContent>[0])
    }
  }
}
