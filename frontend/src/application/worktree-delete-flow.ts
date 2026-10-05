import type { WorktreeId } from '../domain/worktree-graph/types'
import { shortBranchName } from '../presentation/hud/node-label-model'
import type { RuntimeGateway } from './ports/runtime-gateway'
import { failureText } from './i18n/user-facing-error'
import type { SceneStore } from './scene-store'

export type WorktreeDeleteGatewayPort = Pick<RuntimeGateway, 'worktreeRemove' | 'gitStatus'>

export type WorktreeDeleteView =
  | { phase: 'idle' }
  | {
      phase: 'open'
      nodeId: WorktreeId
      branch: string
      /** The primary worktree can never be removed; the panel only explains why. */
      blocked: boolean
      /** `unknown` when git.status failed: absence of a count proves nothing. */
      dirtyFiles: number | 'loading' | 'unknown'
      liveTerminals: number
      agentStatus: string | null
      children: readonly string[]
      removing: boolean
      error: string | null
      /** Set after a non-forced attempt failed; the next confirm sends force. */
      forceOffered: boolean
    }

export type WorktreeDeleteFlowDeps = {
  store: SceneStore
  gateway: WorktreeDeleteGatewayPort
  refreshGraph(): Promise<void>
  /** Camera/focus follow-up once selection moved off the removed node. */
  afterRemoved(selectedId: WorktreeId | null): void
}

export type WorktreeDeleteFlow = {
  view(): WorktreeDeleteView
  subscribe(listener: (view: WorktreeDeleteView) => void): () => void
  request(nodeId: WorktreeId): void
  confirm(): Promise<void>
  /** True when it closed the panel; false when idle or a removal is in flight. */
  cancel(): boolean
  rebindGateway(gateway: WorktreeDeleteGatewayPort): void
}

export function createWorktreeDeleteFlow(deps: WorktreeDeleteFlowDeps): WorktreeDeleteFlow {
  const { store } = deps
  let gateway = deps.gateway
  let current: WorktreeDeleteView = { phase: 'idle' }
  const listeners = new Set<(view: WorktreeDeleteView) => void>()

  function set(next: WorktreeDeleteView): void {
    current = next
    for (const listener of [...listeners]) listener(current)
  }

  function patchOpen(
    nodeId: WorktreeId,
    patch: Partial<Extract<WorktreeDeleteView, { phase: 'open' }>>
  ): void {
    if (current.phase !== 'open' || current.nodeId !== nodeId) return
    set({ ...current, ...patch })
  }

  async function loadDirtyCount(nodeId: WorktreeId): Promise<void> {
    try {
      const status = await gateway.gitStatus(nodeId)
      patchOpen(nodeId, { dirtyFiles: new Set(status.entries.map((entry) => entry.path)).size })
    } catch {
      patchOpen(nodeId, { dirtyFiles: 'unknown' })
    }
  }

  function cleanUp(nodeId: WorktreeId, parentId: WorktreeId | null): void {
    for (const streamId of store.get().terminals.byNode.get(nodeId) ?? []) {
      store.dispatchTerminal({ type: 'close-terminal', streamId })
    }
    // Why: reconcile only walks up from surviving raw childIds, which no longer name the removed node.
    if (store.get().selection.selectedId === nodeId) store.select(parentId)
  }

  return {
    view: () => current,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    request(nodeId) {
      if (current.phase === 'open') return
      const node = store.get().graph.nodes.get(nodeId)
      if (!node) return
      const terminalIds = store.get().terminals.byNode.get(nodeId) ?? []
      const blocked = node.isMain
      set({
        phase: 'open',
        nodeId,
        branch: shortBranchName(node.branch),
        blocked,
        dirtyFiles: blocked ? 'unknown' : 'loading',
        liveTerminals: terminalIds.filter(
          (id) => store.get().terminals.sessions.get(id)?.status !== 'ended'
        ).length,
        agentStatus: node.activity.agentStatus ?? null,
        children: node.childIds.flatMap((id) => {
          const child = store.get().graph.nodes.get(id)
          return child ? [shortBranchName(child.branch)] : []
        }),
        removing: false,
        error: null,
        forceOffered: false
      })
      if (!blocked) void loadDirtyCount(nodeId)
    },
    async confirm() {
      if (current.phase !== 'open' || current.blocked || current.removing) return
      const { nodeId, forceOffered } = current
      const node = store.get().graph.nodes.get(nodeId)
      const parentId = node?.parentId ?? null
      patchOpen(nodeId, { removing: true, error: null })
      try {
        await gateway.worktreeRemove(nodeId, {
          ...(node?.hostId ? { hostId: node.hostId } : {}),
          ...(forceOffered ? { force: true } : {})
        })
      } catch (error) {
        // Why: git's refusal text is not a stable code, so any failed plain attempt may be retried
        // with force; it still needs its own explicit confirm.
        patchOpen(nodeId, {
          removing: false,
          error: failureText('worktreeDelete', error),
          forceOffered: true
        })
        return
      }
      cleanUp(nodeId, parentId)
      set({ phase: 'idle' })
      await deps.refreshGraph()
      deps.afterRemoved(store.get().selection.selectedId)
    },
    cancel() {
      if (current.phase !== 'open' || current.removing) return false
      set({ phase: 'idle' })
      return true
    },
    rebindGateway(next) {
      gateway = next
    }
  }
}
