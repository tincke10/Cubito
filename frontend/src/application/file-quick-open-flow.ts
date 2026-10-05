import type { WorktreeId } from '../domain/worktree-graph/types'
import type { FilePathMatch, RuntimeGateway } from './ports/runtime-gateway'
import { describeFailure } from './i18n/user-facing-error'
import type { FailureMessage } from './i18n/user-facing-error'

export type FileQuickOpenGatewayPort = Pick<RuntimeGateway, 'filesSearchPaths'>

export type FileQuickOpenView =
  | { phase: 'closed' }
  | {
      phase: 'open'
      nodeId: WorktreeId
      query: string
      rows: readonly FilePathMatch[]
      highlighted: number
      searching: boolean
      error: FailureMessage | null
    }

export type FileQuickOpenFlow = {
  view(): FileQuickOpenView
  subscribe(listener: (view: FileQuickOpenView) => void): () => void
  open(nodeId: WorktreeId): void
  /** True when it closed the picker; false when it was not open. */
  close(): boolean
  setQuery(query: string): void
  moveHighlight(delta: number): void
  /** Picks a row (default: the highlighted one): closes the picker and reports it through `onPick`. */
  activate(index?: number): void
  rebindGateway(gateway: FileQuickOpenGatewayPort): void
}

export type FileQuickOpenDeps = {
  gateway: FileQuickOpenGatewayPort
  onPick(nodeId: WorktreeId, relativePath: string): void
  debounceMs?: number
}

const DEFAULT_DEBOUNCE_MS = 150
const RESULT_LIMIT = 20

const wrap = (index: number, total: number): number => ((index % total) + total) % total

export function createFileQuickOpenFlow(deps: FileQuickOpenDeps): FileQuickOpenFlow {
  let gateway = deps.gateway
  const debounceMs = deps.debounceMs ?? DEFAULT_DEBOUNCE_MS
  let current: FileQuickOpenView = { phase: 'closed' }
  let timer: ReturnType<typeof setTimeout> | null = null
  // Why: a slower, older reply must never overwrite the rows of a newer query.
  let generation = 0
  const listeners = new Set<(view: FileQuickOpenView) => void>()

  function set(next: FileQuickOpenView): void {
    current = next
    for (const listener of [...listeners]) listener(current)
  }

  function cancelPending(): void {
    if (timer !== null) clearTimeout(timer)
    timer = null
    generation += 1
  }

  async function search(nodeId: WorktreeId, query: string, own: number): Promise<void> {
    let rows: readonly FilePathMatch[]
    try {
      rows = (await gateway.filesSearchPaths(nodeId, query, RESULT_LIMIT)).files
    } catch (error) {
      if (own === generation && current.phase === 'open') {
        set({
          ...current,
          searching: false,
          rows: [],
          error: describeFailure('quickOpenSearch', error)
        })
      }
      return
    }
    if (own !== generation || current.phase !== 'open') return
    set({ ...current, rows, highlighted: 0, searching: false, error: null })
  }

  return {
    view: () => current,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    open(nodeId) {
      cancelPending()
      set({
        phase: 'open',
        nodeId,
        query: '',
        rows: [],
        highlighted: 0,
        searching: false,
        error: null
      })
    },
    close() {
      if (current.phase !== 'open') return false
      cancelPending()
      set({ phase: 'closed' })
      return true
    },
    setQuery(query) {
      if (current.phase !== 'open') return
      cancelPending()
      const { nodeId } = current
      const blank = query.trim() === ''
      set({
        ...current,
        query,
        searching: false,
        error: null,
        ...(blank ? { rows: [], highlighted: 0 } : {})
      })
      if (blank) return
      const own = generation
      timer = setTimeout(() => {
        timer = null
        if (current.phase === 'open') set({ ...current, searching: true })
        void search(nodeId, query, own)
      }, debounceMs)
    },
    moveHighlight(delta) {
      if (current.phase !== 'open' || current.rows.length === 0) return
      set({ ...current, highlighted: wrap(current.highlighted + delta, current.rows.length) })
    },
    activate(index) {
      if (current.phase !== 'open') return
      const row = current.rows[index ?? current.highlighted]
      if (!row) return
      const { nodeId } = current
      cancelPending()
      set({ phase: 'closed' })
      deps.onPick(nodeId, row.relativePath)
    },
    rebindGateway(next) {
      gateway = next
    }
  }
}
