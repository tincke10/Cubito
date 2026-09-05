import type { RawWorktreeRecord } from '../../domain/worktree-graph/build-graph'
import type {
  CreateWorktreeInput,
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
    }
  }
}
