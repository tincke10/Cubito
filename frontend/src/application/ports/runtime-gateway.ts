import type { RawWorktreeRecord } from '../../domain/worktree-graph/build-graph'

/** Repo identity from `repo.list`/`repo.add`; `id` alone builds an `id:`-style repo selector. */
export type RepoSummary = {
  id: string
  path: string
  displayName: string
  kind: 'git' | 'folder' | null
}

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
  addRepo(input: { path: string; kind?: 'git' | 'folder' }): Promise<RepoSummary>
}
