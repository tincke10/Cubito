import type { WorktreeId } from '../domain/worktree-graph/types'
import type { RuntimeGateway, SourceControlStatus } from './ports/runtime-gateway'
import type { SceneStore } from './scene-store'

export type SourceControlGatewayPort = Pick<
  RuntimeGateway,
  'gitSourceControlStatus' | 'gitStage' | 'gitUnstage' | 'gitCommit' | 'gitPush'
>

export type StageState = 'staged' | 'partial' | 'unstaged'
export type SourceControlBusy = 'stage' | 'commit' | 'push'
export type SourceControlNotice = { tone: 'ok' | 'error'; text: string }

export type SourceControlView =
  | { phase: 'hidden' }
  | {
      phase: 'ready'
      nodeId: WorktreeId
      branch: string
      stageStates: ReadonlyMap<string, StageState>
      stagedCount: number
      hasUpstream: boolean
      ahead: number
      behind: number
      message: string
      busy: SourceControlBusy | null
      notice: SourceControlNotice | null
      canCommit: boolean
      canPush: boolean
    }

export type SourceControlFlowDeps = {
  store: SceneStore
  gateway: SourceControlGatewayPort
  /** Reloads the diff rail so staged/committed files show their new state. */
  refreshDiff(): void
}

export type SourceControlFlow = {
  view(): SourceControlView
  subscribe(listener: (view: SourceControlView) => void): () => void
  /** Loads status for a node; stays hidden for folder workspaces or when git.status fails. */
  open(nodeId: WorktreeId): Promise<void>
  close(): void
  toggleStage(path: string): Promise<void>
  setMessage(message: string): void
  commit(): Promise<void>
  push(): Promise<void>
  rebindGateway(gateway: SourceControlGatewayPort): void
}

type Ready = Extract<SourceControlView, { phase: 'ready' }>

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

function stageStatesOf(entries: SourceControlStatus['entries']): Map<string, StageState> {
  const areas = new Map<string, { staged: boolean; unstaged: boolean }>()
  for (const entry of entries) {
    const area = areas.get(entry.path) ?? { staged: false, unstaged: false }
    if (entry.area === 'staged') area.staged = true
    else area.unstaged = true
    areas.set(entry.path, area)
  }
  return new Map(
    [...areas].map(([path, area]) => [
      path,
      area.staged ? (area.unstaged ? 'partial' : 'staged') : 'unstaged'
    ])
  )
}

const withDerived = (view: Omit<Ready, 'canCommit' | 'canPush'>): Ready => ({
  ...view,
  canCommit: view.busy === null && view.stagedCount > 0 && view.message.trim().length > 0,
  // Why: an existing upstream with nothing ahead has nothing to push; no upstream means publish.
  canPush: view.busy === null && (!view.hasUpstream || view.ahead > 0)
})

export function createSourceControlFlow(deps: SourceControlFlowDeps): SourceControlFlow {
  let gateway = deps.gateway
  let current: SourceControlView = { phase: 'hidden' }
  let generation = 0
  const listeners = new Set<(view: SourceControlView) => void>()

  function set(next: SourceControlView): void {
    current = next
    for (const listener of [...listeners]) listener(current)
  }

  function patch(patchFields: Partial<Omit<Ready, 'canCommit' | 'canPush'>>): void {
    if (current.phase !== 'ready') return
    const { canCommit: _c, canPush: _p, ...base } = current
    set(withDerived({ ...base, ...patchFields }))
  }

  /** Re-reads status for the current node; returns false when superseded or git.status failed. */
  async function reload(nodeId: WorktreeId, ownGeneration: number): Promise<boolean> {
    let status: SourceControlStatus
    try {
      status = await gateway.gitSourceControlStatus(nodeId)
    } catch {
      if (ownGeneration === generation) set({ phase: 'hidden' })
      return false
    }
    if (ownGeneration !== generation) return false
    const stageStates = stageStatesOf(status.entries)
    const previous = current.phase === 'ready' ? current : null
    set(
      withDerived({
        phase: 'ready',
        nodeId,
        branch: status.branch,
        stageStates,
        stagedCount: [...stageStates.values()].filter((state) => state !== 'unstaged').length,
        hasUpstream: status.hasUpstream,
        ahead: status.ahead,
        behind: status.behind,
        message: previous?.message ?? '',
        busy: previous?.busy ?? null,
        notice: previous?.notice ?? null
      })
    )
    return true
  }

  async function run(
    busy: SourceControlBusy,
    action: (view: Ready) => Promise<SourceControlNotice | null>
  ): Promise<void> {
    if (current.phase !== 'ready' || current.busy !== null) return
    const { nodeId } = current
    const ownGeneration = generation
    patch({ busy, notice: null })
    let notice: SourceControlNotice | null
    try {
      notice = await action(current as Ready)
    } catch (error) {
      notice = { tone: 'error', text: messageOf(error) }
    }
    if (ownGeneration !== generation) return
    patch({ busy: null, notice })
    if (await reload(nodeId, ownGeneration)) deps.refreshDiff()
  }

  return {
    view: () => current,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    async open(nodeId) {
      const ownGeneration = ++generation
      set({ phase: 'hidden' })
      const node = deps.store.get().graph.nodes.get(nodeId)
      const repo = deps.store.get().repos.list.find((entry) => entry.id === node?.repoId)
      if (!node || repo?.kind === 'folder') return
      await reload(nodeId, ownGeneration)
    },
    close() {
      generation += 1
      set({ phase: 'hidden' })
    },
    toggleStage(path) {
      return run('stage', async (view) => {
        const state = view.stageStates.get(path)
        if (state === undefined) return null
        if (state === 'staged') await gateway.gitUnstage(view.nodeId, [path])
        else await gateway.gitStage(view.nodeId, [path])
        return null
      })
    },
    setMessage(message) {
      patch({ message })
    },
    commit() {
      if (current.phase !== 'ready' || !current.canCommit) return Promise.resolve()
      return run('commit', async (view) => {
        const result = await gateway.gitCommit(view.nodeId, view.message.trim())
        if (!result.success) return { tone: 'error', text: result.error }
        patch({ message: '' })
        return { tone: 'ok', text: 'commit creado' }
      })
    },
    push() {
      if (current.phase !== 'ready' || !current.canPush) return Promise.resolve()
      return run('push', async (view) => {
        await gateway.gitPush(view.nodeId, view.hasUpstream ? {} : { publish: true })
        return { tone: 'ok', text: view.hasUpstream ? 'push realizado' : 'rama publicada' }
      })
    },
    rebindGateway(next) {
      gateway = next
    }
  }
}
