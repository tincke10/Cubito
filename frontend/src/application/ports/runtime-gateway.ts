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

/** `orchestration.workerList` scoped to a lease Run — no `from` (Change C). */
export type LeaseWorkerListInput = { run: string; terminalState?: string }

/** One `orchestration.workerList` row, projected to only what member-status correlation needs. */
export type WorkerDispatchStateRow = {
  dispatchId: string
  workerState: string
  dispatchStatus: string
  worktreeId: string | null
}

export type LeaseWorkerListResult = { workers: readonly WorkerDispatchStateRow[] }

/** `orchestration.workerShow` for one live dispatch — no `from`, no `run` (Change C MINIMAL+):
 *  the engine derives lease ownership from the dispatch's own run_id, so only `dispatch` is sent. */
export type LeaseWorkerShowInput = { dispatch: string }

/** Projects only the waiting-for-human signal (`observation.agentWait`): true when the worker
 *  is parked on a prompt only a human can answer, false when observed and not waiting, null
 *  when the engine never looked (older host, unverifiable identity, unreadable pane). */
export type LeaseWorkerShowResult = { awaitingInput: boolean | null }

/** `orchestration.gateList` scoped to a lease Run — no `from` (Change C-EXTENDED). */
export type LeaseGateListInput = { run: string }

/** One `orchestration.gateList` row: a decision gate raised on the lease Run's tasks.
 *  `status`/other engine-owned enums stay plain `string` (mirrors `WorkerDispatchStateRow`) so a
 *  future engine-side status value doesn't require a frontend type change. */
export type LeaseGateRow = {
  id: string
  runId: string
  taskId: string
  question: string
  options: string
  status: string
  resolution: string | null
  createdAt: string
  resolvedAt: string | null
}

export type LeaseGateListResult = { gates: readonly LeaseGateRow[] }

/** `orchestration.questionList` scoped to a lease Run — no `from` (Change C-EXTENDED); the
 *  method itself is only reachable via a paired GUI Run lease (engine-side). */
export type LeaseQuestionListInput = { run: string }

/** One `orchestration.questionList` row: an inbox question thread on the lease Run. */
export type LeaseQuestionRow = {
  messageId: string
  runId: string
  dispatchId: string
  askerHandle: string
  status: string
  answerMessageId: string | null
  answerBody: string | null
  answeredByGeneration: number | null
  createdAt: string
  answeredAt: string | null
  closedAt: string | null
}

export type LeaseQuestionListResult = { questions: readonly LeaseQuestionRow[] }

/** `git.mergeWinnerIntoParent` result (Change E): LOCAL mirror of the engine's headless-merge
 *  outcome — clean moves the parent branch ref, conflict mutates nothing (file-name list only). */
export type MergeWinnerResult =
  | { outcome: 'clean'; commitOid: string }
  | { outcome: 'conflict'; files: readonly string[] }

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
  orchestrationWorkerList(input: LeaseWorkerListInput): Promise<LeaseWorkerListResult>
  orchestrationWorkerShow(input: LeaseWorkerShowInput): Promise<LeaseWorkerShowResult>
  orchestrationGateList(input: LeaseGateListInput): Promise<LeaseGateListResult>
  orchestrationQuestionList(input: LeaseQuestionListInput): Promise<LeaseQuestionListResult>
  /** Headless-merges the winner child's branch into the parent branch (Change E). `message`
   *  defaults host-side when omitted. */
  gitMergeWinnerIntoParent(
    parent: string,
    winner: string,
    message?: string
  ): Promise<MergeWinnerResult>
}
