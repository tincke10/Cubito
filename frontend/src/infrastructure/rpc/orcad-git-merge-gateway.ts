import type { MergeWinnerResult, RuntimeGateway } from '../../application/ports/runtime-gateway'
import type { RpcCaller } from './orcad-gateway'

export type GitMergeMethods = Pick<RuntimeGateway, 'gitMergeWinnerIntoParent'>

/** Projects a raw `git.mergeWinnerIntoParent` result onto the local `MergeWinnerResult` shape. */
function toMergeWinnerResult(result: {
  outcome?: unknown
  commitOid?: unknown
  files?: unknown
}): MergeWinnerResult {
  if (result.outcome === 'clean' && typeof result.commitOid === 'string') {
    return { outcome: 'clean', commitOid: result.commitOid }
  }
  if (result.outcome === 'conflict' && Array.isArray(result.files)) {
    const files = result.files as unknown[]
    if (files.every((file): file is string => typeof file === 'string')) {
      return { outcome: 'conflict', files }
    }
  }
  throw new Error('git.mergeWinnerIntoParent returned a malformed result')
}

/**
 * git.* gateway methods (Change E), kept out of orcad-gateway.ts (267 lines — max-lines) as its
 * own module, mirroring orcad-orchestration-gateway.ts's compose-in pattern.
 */
export function createGitMergeMethods(connection: { call: RpcCaller }): GitMergeMethods {
  return {
    async gitMergeWinnerIntoParent(parent, winner, message) {
      const response = await connection.call('git.mergeWinnerIntoParent', {
        parent,
        winner,
        ...(message !== undefined ? { message } : {})
      })
      return toMergeWinnerResult(response.result as Parameters<typeof toMergeWinnerResult>[0])
    }
  }
}
