import type { RawWorktreeRecord } from '../../domain/worktree-graph/build-graph'

/**
 * Port to the orcad runtime. The application layer depends on this shape
 * only; infrastructure provides the RPC-backed implementation.
 */
export type RuntimeGateway = {
  listWorktrees(): Promise<readonly RawWorktreeRecord[]>
}
