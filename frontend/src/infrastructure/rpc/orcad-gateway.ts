import type { RawWorktreeRecord } from '../../domain/worktree-graph/build-graph'
import type { RuntimeGateway } from '../../application/ports/runtime-gateway'
import type { RpcSuccessFrame } from './envelope'

/** The one method of RpcConnection the gateway needs; eases test doubles. */
export type RpcCaller = (method: string, params?: unknown) => Promise<RpcSuccessFrame>

export function createOrcadGateway(connection: { call: RpcCaller }): RuntimeGateway {
  return {
    async listWorktrees() {
      const response = await connection.call('worktree.list')
      const result = response.result as { worktrees?: unknown }
      if (!Array.isArray(result?.worktrees)) {
        throw new Error('worktree.list returned no worktrees array')
      }
      return result.worktrees as RawWorktreeRecord[]
    }
  }
}
