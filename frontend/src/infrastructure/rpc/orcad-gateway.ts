import type { RawWorktreeRecord } from '../../domain/worktree-graph/build-graph'
import type { CreateWorktreeInput, RuntimeGateway } from '../../application/ports/runtime-gateway'
import type { RpcSuccessFrame } from './envelope'

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
      return result.repos as { id: string }[]
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
    }
  }
}
