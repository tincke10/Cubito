import { inertActivity, type AgentStatus } from '../domain/worktree-graph/node-activity'
import type { WorktreeGraph, WorktreeId, WorktreeNode } from '../domain/worktree-graph/types'
import type { CreateWorktreeInput, SpawnAgent } from './ports/runtime-gateway'

export const MIN_FANOUT = 2
export const MAX_FANOUT = 8
const DEFAULT_FANOUT_COUNT = 3

/** Marks a graph node as a fan-out-in-flight placeholder, not a real worktree yet. */
export const FANOUT_PLACEHOLDER_PREFIX = 'fanout:'

export type FanOutFormFields = {
  count: number
  agent: SpawnAgent
  prompt: string
}

/** One requested child in the batch: pending until `worktreeId` arrives, or `failed`. */
export type FanOutBatchEntry = {
  mutationId: string
  worktreeId: WorktreeId | null
  failed: boolean
}

/** closed → form (anchored to a node) → running (batch in flight) → closed. */
export type FanOutSlice =
  | { view: 'closed'; repoSelector: string | null }
  | {
      view: 'form'
      parentId: WorktreeId
      fields: FanOutFormFields
      repoSelector: string | null
      errorMessage?: string
    }
  | {
      view: 'running'
      parentId: WorktreeId
      fields: FanOutFormFields
      repoSelector: string | null
      batch: readonly FanOutBatchEntry[]
      memberStatus: Record<WorktreeId, AgentStatus>
    }

export const emptyFanOutSlice = (): FanOutSlice => ({ view: 'closed', repoSelector: null })

export type FanOutAction =
  | { type: 'open-for-node'; nodeId: WorktreeId }
  | { type: 'update-count'; count: number }
  | { type: 'update-agent'; agent: SpawnAgent }
  | { type: 'update-prompt'; prompt: string }
  | { type: 'set-repo-selector'; repoSelector: string }
  | { type: 'submit'; mutationIds: readonly string[] }
  | { type: 'form-error'; message: string }
  | { type: 'child-created'; mutationId: string; worktreeId: WorktreeId }
  | { type: 'child-failed'; mutationId: string }
  | { type: 'member-status'; worktreeId: WorktreeId; status: AgentStatus }
  | { type: 'cancel' }
  | { type: 'close' }

export const clampFanOutCount = (count: number): number =>
  Math.min(MAX_FANOUT, Math.max(MIN_FANOUT, count))

export function reduceFanOut(slice: FanOutSlice, action: FanOutAction): FanOutSlice {
  switch (action.type) {
    case 'open-for-node':
      return openForm(slice, action.nodeId)
    case 'update-count':
      return slice.view === 'form'
        ? { ...slice, fields: { ...slice.fields, count: clampFanOutCount(action.count) } }
        : slice
    case 'update-agent':
      return slice.view === 'form'
        ? { ...slice, fields: { ...slice.fields, agent: action.agent } }
        : slice
    case 'update-prompt':
      return slice.view === 'form'
        ? { ...slice, fields: { ...slice.fields, prompt: action.prompt } }
        : slice
    case 'set-repo-selector':
      return slice.view === 'closed' ? slice : { ...slice, repoSelector: action.repoSelector }
    case 'submit':
      return startSubmit(slice, action.mutationIds)
    case 'form-error':
      return slice.view === 'form' ? { ...slice, errorMessage: action.message } : slice
    case 'child-created':
      return slice.view === 'running'
        ? {
            ...slice,
            batch: withEntry(slice.batch, action.mutationId, (e) => ({
              ...e,
              worktreeId: action.worktreeId
            }))
          }
        : slice
    case 'child-failed':
      return slice.view === 'running'
        ? {
            ...slice,
            batch: withEntry(slice.batch, action.mutationId, (e) => ({ ...e, failed: true }))
          }
        : slice
    case 'member-status':
      return slice.view === 'running'
        ? { ...slice, memberStatus: { ...slice.memberStatus, [action.worktreeId]: action.status } }
        : slice
    case 'cancel':
    case 'close':
      return { view: 'closed', repoSelector: slice.repoSelector }
    default:
      return slice
  }
}

const withEntry = (
  batch: readonly FanOutBatchEntry[],
  mutationId: string,
  update: (entry: FanOutBatchEntry) => FanOutBatchEntry
): readonly FanOutBatchEntry[] =>
  batch.map((entry) => (entry.mutationId === mutationId ? update(entry) : entry))

function openForm(slice: FanOutSlice, parentId: WorktreeId): FanOutSlice {
  return {
    view: 'form',
    parentId,
    fields: { count: DEFAULT_FANOUT_COUNT, agent: 'none', prompt: '' },
    repoSelector: slice.repoSelector
  }
}

function startSubmit(slice: FanOutSlice, mutationIds: readonly string[]): FanOutSlice {
  if (slice.view !== 'form') return slice
  if (slice.fields.count < MIN_FANOUT || slice.fields.count > MAX_FANOUT) {
    return { ...slice, errorMessage: `count must be between ${MIN_FANOUT} and ${MAX_FANOUT}` }
  }
  if (slice.repoSelector === null) {
    return { ...slice, errorMessage: 'a repo must be selected' }
  }
  const batch: FanOutBatchEntry[] = mutationIds.map((mutationId) => ({
    mutationId,
    worktreeId: null,
    failed: false
  }))
  return {
    view: 'running',
    parentId: slice.parentId,
    fields: slice.fields,
    repoSelector: slice.repoSelector,
    batch,
    memberStatus: {}
  }
}

/** Maps form fields + parent lineage + resolved repo selector to N `worktree.create` params. */
export function toFanOutInputs(
  slice: FanOutSlice,
  repoSelector: string,
  mutationIds: readonly string[]
): CreateWorktreeInput[] {
  if (slice.view === 'closed') return []
  const { fields, parentId } = slice
  return mutationIds.map((mutationId) => {
    const input: CreateWorktreeInput = {
      repo: repoSelector,
      parentWorktree: parentId,
      clientMutationId: mutationId
    }
    if (fields.agent !== 'none') {
      input.startupAgent = fields.agent
      if (fields.prompt.trim() !== '') input.startupPrompt = fields.prompt
    }
    return input
  })
}

/** `worktree.ps` status → the graph's `AgentStatus` vocabulary. */
export function mapPsStatusToAgentStatus(psStatus: string): AgentStatus {
  if (psStatus === 'working') return 'working'
  if (psStatus === 'permission') return 'waiting-input'
  return 'idle'
}

/** Parent plus every batch entry that already has a real worktreeId (pending/failed excluded). */
export function fanOutMemberIds(slice: FanOutSlice): readonly WorktreeId[] {
  if (slice.view === 'closed') return []
  const created =
    slice.view === 'running'
      ? slice.batch
          .filter(
            (entry): entry is FanOutBatchEntry & { worktreeId: WorktreeId } =>
              entry.worktreeId !== null
          )
          .map((entry) => entry.worktreeId)
      : []
  return [slice.parentId, ...created]
}

export type FanOutCounts = {
  total: number
  naciendo: number
  working: number
  waitingInput: number
  created: number
  failed: number
}

const emptyFanOutCounts = (): FanOutCounts => ({
  total: 0,
  naciendo: 0,
  working: 0,
  waitingInput: 0,
  created: 0,
  failed: 0
})

/** Partitions the batch ledger: naciendo/failed come from the ledger itself, working/waitingInput/created from memberStatus. */
export function fanOutCounts(slice: FanOutSlice): FanOutCounts {
  if (slice.view !== 'running') return emptyFanOutCounts()
  const counts = emptyFanOutCounts()
  counts.total = slice.batch.length
  for (const entry of slice.batch) {
    if (entry.failed) {
      counts.failed += 1
      continue
    }
    if (entry.worktreeId === null) {
      counts.naciendo += 1
      continue
    }
    const status = slice.memberStatus[entry.worktreeId] ?? 'idle'
    if (status === 'working') counts.working += 1
    else if (status === 'waiting-input') counts.waitingInput += 1
    else counts.created += 1
  }
  return counts
}

const buildPlaceholder = (
  parent: WorktreeNode | undefined,
  entry: FanOutBatchEntry,
  parentId: WorktreeId
): WorktreeNode => ({
  id: `${FANOUT_PLACEHOLDER_PREFIX}${entry.mutationId}`,
  repoId: parent?.repoId ?? '',
  branch: '',
  path: '',
  status: 'pending',
  isMain: false,
  kind: 'worktree',
  parentId,
  childIds: [],
  activity: { ...inertActivity(), spawn: { phase: 'pending', progress: 0 } }
})

/**
 * Overlays the in-flight fan-out batch onto a real graph: a `spawning` placeholder node per
 * pending entry (linked into the parent's childIds — `childrenOf` reads that, not `edges`),
 * and `memberStatus` overlaid onto already-real members. Idempotent: strips stale placeholders
 * from the input before re-deriving, so composing on top of a prior composition converges.
 */
export function composeFanOutGraph(graph: WorktreeGraph, slice: FanOutSlice): WorktreeGraph {
  if (slice.view !== 'running') return graph

  const pending = slice.batch.filter((entry) => !entry.failed && entry.worktreeId === null)
  const pendingIds = pending.map((entry) => `${FANOUT_PLACEHOLDER_PREFIX}${entry.mutationId}`)
  const parent = graph.nodes.get(slice.parentId)

  const nodes = new Map<WorktreeId, WorktreeNode>()
  for (const [id, existing] of graph.nodes) {
    if (id.startsWith(FANOUT_PLACEHOLDER_PREFIX)) continue
    const status = slice.memberStatus[id]
    const withStatus =
      status !== undefined
        ? { ...existing, activity: { ...existing.activity, agentStatus: status } }
        : existing
    if (id === slice.parentId) {
      const keptChildIds = withStatus.childIds.filter(
        (childId) => !childId.startsWith(FANOUT_PLACEHOLDER_PREFIX)
      )
      nodes.set(id, { ...withStatus, childIds: [...keptChildIds, ...pendingIds] })
    } else {
      nodes.set(id, withStatus)
    }
  }
  for (const entry of pending) {
    const placeholder = buildPlaceholder(parent, entry, slice.parentId)
    nodes.set(placeholder.id, placeholder)
  }

  return { ...graph, nodes }
}
