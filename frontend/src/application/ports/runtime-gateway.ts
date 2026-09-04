import type { RawWorktreeRecord } from '../../domain/worktree-graph/build-graph'

/** Minimal repo identity from `repo.list`; enough to build an `id:`-style repo selector. */
export type RepoSummary = { id: string }

/** Startup agent choice for a spawned worktree; `'none'` omits agent params entirely. */
export type SpawnAgent = 'none' | 'claude'

export type CreateWorktreeInput = {
  repo: string
  name?: string
  baseBranch?: string
  parentWorktree?: string
  startupAgent?: SpawnAgent
  startupPrompt?: string
  clientMutationId?: string
}

export type CreateWorktreeResult = {
  worktreeId: string
  warnings?: readonly string[]
}

/**
 * Port to the orcad runtime. The application layer depends on this shape
 * only; infrastructure provides the RPC-backed implementation.
 */
export type RuntimeGateway = {
  listWorktrees(): Promise<readonly RawWorktreeRecord[]>
  listRepos(): Promise<readonly RepoSummary[]>
  createWorktree(input: CreateWorktreeInput): Promise<CreateWorktreeResult>
}
