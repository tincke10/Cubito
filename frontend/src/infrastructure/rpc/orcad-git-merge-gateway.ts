import type {
  MergeWinnerResult,
  ParentWorkingTreeSyncResult,
  RuntimeGateway
} from '../../application/ports/runtime-gateway'
import type { RpcCaller } from './orcad-gateway'

export type GitMergeMethods = Pick<RuntimeGateway, 'gitMergeWinnerIntoParent'>

/** Projects a raw `workingTree` sub-shape; malformed/missing -> undefined (best-effort field,
 *  should not fail the whole merge result). */
function toWorkingTreeResult(workingTree: unknown): ParentWorkingTreeSyncResult | undefined {
  if (typeof workingTree !== 'object' || workingTree === null) {
    return undefined
  }
  const w = workingTree as { status?: unknown; reason?: unknown; message?: unknown }
  if (w.status === 'synced') {
    return { status: 'synced' }
  }
  if (w.status === 'skipped' && w.reason === 'dirty') {
    return { status: 'skipped', reason: 'dirty' }
  }
  if (w.status === 'failed' && typeof w.message === 'string') {
    return { status: 'failed', message: w.message }
  }
  return undefined
}

/** Projects a raw `git.mergeWinnerIntoParent` result onto the local `MergeWinnerResult` shape. */
function toMergeWinnerResult(result: {
  outcome?: unknown
  commitOid?: unknown
  files?: unknown
  workingTree?: unknown
}): MergeWinnerResult {
  if (result.outcome === 'clean' && typeof result.commitOid === 'string') {
    const workingTree = toWorkingTreeResult(result.workingTree)
    return {
      outcome: 'clean',
      commitOid: result.commitOid,
      ...(workingTree ? { workingTree } : {})
    }
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
    async gitMergeWinnerIntoParent(parent, winner, message, syncWorkingTree) {
      const response = await connection.call('git.mergeWinnerIntoParent', {
        parent,
        winner,
        ...(message !== undefined ? { message } : {}),
        ...(syncWorkingTree === true ? { syncWorkingTree: true } : {})
      })
      return toMergeWinnerResult(response.result as Parameters<typeof toMergeWinnerResult>[0])
    }
  }
}
