import type { RuntimeGateway } from '../../application/ports/runtime-gateway'
import type { RpcCaller } from './orcad-gateway'

export type WorktreeRemoveMethods = Pick<RuntimeGateway, 'worktreeRemove'>

/** `worktree.rm` gateway, its own module because orcad-gateway.ts is at its max-lines budget. */
export function createWorktreeRemoveMethods(connection: {
  call: RpcCaller
}): WorktreeRemoveMethods {
  return {
    async worktreeRemove(worktree, options = {}) {
      const response = await connection.call('worktree.rm', {
        worktree,
        ...(options.hostId ? { hostId: options.hostId } : {}),
        ...(options.force === true ? { force: true } : {})
      })
      const result = response.result as
        | { removed?: unknown; warning?: unknown; preservedBranch?: unknown }
        | undefined
      if (result?.removed !== true) throw new Error('worktree.rm did not remove the worktree')
      return {
        removed: true,
        ...(typeof result.warning === 'string' ? { warning: result.warning } : {}),
        ...(typeof result.preservedBranch === 'string'
          ? { preservedBranch: result.preservedBranch }
          : {})
      }
    }
  }
}
