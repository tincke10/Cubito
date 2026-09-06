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
  /** True when `name` was auto-generated (not user-typed), so the host may retire it on collision. */
  nameWasGenerated?: boolean
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

/** One `worktree.ps` row: which worktree, and its live agent-process status. */
export type WorktreePsRow = {
  worktreeId: string
  status: string
}

/** One per-file row from `git.status`/`git.branchCompare` entries. */
export type GitStatusRow = {
  path: string
  status: string
  added: number
  removed: number
}

/** Minimal projection of `git.status` — not the full result; only what diff-mode/live-sync/fan-out need. */
export type GitStatus = {
  entries: readonly GitStatusRow[]
  branch: string
  branchLineTotal: number
}

/** Minimal projection of `git.branchCompare`. */
export type BranchCompare = {
  changedFiles: number
  commitsAhead: number
  commitsBehind: number
  baseRef: string
  headOid: string
  mergeBase: string
  status: string
  entries: readonly GitStatusRow[]
}

/** Per-file diff content from `git.branchDiff` — before/after text, or a binary marker. */
export type DiffFileContent =
  | { kind: 'text'; originalContent: string; modifiedContent: string; truncated: boolean }
  | { kind: 'binary'; mimeType?: string; modifiedDeleted?: boolean }

/** One `system.snapshot` node. Local mirror (rpc-purity) of the engine wire shape — no `state`,
 *  that ladder is derived frontend-side. `diff` is always null until Change D adds real git diff. */
export type SystemSnapshotNode = {
  id: string
  kind: 'router' | 'endpoint' | 'service' | 'database'
  label: string
  method?: string
  path?: string
  diff: null
}

export type SystemSnapshotEdge = {
  from: string
  to: string
  kind: 'normal' | 'flow' | 'faint'
}

/** Minimal projection of `system.snapshot` — the live system graph for one worktree. */
export type SystemGraphSnapshot = {
  nodes: readonly SystemSnapshotNode[]
  edges: readonly SystemSnapshotEdge[]
}

/** `orchestration.runCreate` with no `from` — a lease-run caller (Change B, camada lease). */
export type LeaseRunCreateInput = { objective: string }
export type LeaseRunCreateResult = { runId: string }

/** `orchestration.taskCreate` with no `callerTerminalHandle` — same lease-caller branch. */
export type LeaseTaskCreateInput = {
  spec: string
  run: string
  taskTitle?: string
  displayName?: string
  deps?: readonly string[]
}
export type LeaseTaskCreateResult = { taskId: string }

/** `orchestration.workerStart` with no `from`; `worktree` is required for a lease caller
 *  (the engine rejects current/new-child/new-top-level placement for it). */
export type LeaseWorkerStartInput = {
  task: string
  run: string
  worktree: string
  agent?: string
  name?: string
  displayName?: string
}
export type LeaseWorkerStartResult = {
  dispatchId: string
  runId: string
  taskId: string
  state: string
  stage: string
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
  listWorktreePs(): Promise<readonly WorktreePsRow[]>
  gitStatus(worktree: string): Promise<GitStatus>
  gitBranchCompare(worktree: string, baseRef: string): Promise<BranchCompare>
  gitBranchDiff(
    worktree: string,
    compare: { mergeBase: string; headOid: string },
    filePath: string,
    oldPath?: string
  ): Promise<DiffFileContent>
  systemSnapshot(worktree: string): Promise<SystemGraphSnapshot>
  orchestrationRunCreate(input: LeaseRunCreateInput): Promise<LeaseRunCreateResult>
  orchestrationTaskCreate(input: LeaseTaskCreateInput): Promise<LeaseTaskCreateResult>
  orchestrationWorkerStart(input: LeaseWorkerStartInput): Promise<LeaseWorkerStartResult>
}
