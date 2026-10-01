import type { WorktreeId } from '../domain/worktree-graph/types'
import type { RuntimeGateway } from './ports/runtime-gateway'

export type FileEditorGatewayPort = Pick<RuntimeGateway, 'filesRead' | 'filesStat' | 'filesWrite'>

export type FileReadOnlyReason = 'truncated' | 'binary'

export type FileEditorView =
  | { phase: 'closed' }
  | {
      phase: 'open'
      nodeId: WorktreeId
      path: string
      status: 'loading' | 'ready' | 'error'
      content: string
      readOnly: FileReadOnlyReason | null
      error: string | null
    }

export type FileEditorDeps = {
  gateway: FileEditorGatewayPort
  /** Fired after a successful write so diff/status can refresh. */
  onSaved(nodeId: WorktreeId, path: string): void
}

export type FileEditorFlow = {
  view(): FileEditorView
  subscribe(listener: (view: FileEditorView) => void): () => void
  isOpen(): boolean
  open(nodeId: WorktreeId, path: string): Promise<void>
  /** True when the key was consumed (closed the view); false when nothing was open. */
  requestClose(): boolean
  rebindGateway(gateway: FileEditorGatewayPort): void
}

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

// Why: the host reports binary paths as a plain Error message, not a structured code.
const isBinaryRefusal = (error: unknown): boolean => messageOf(error) === 'binary_file'

export function createFileEditorFlow(deps: FileEditorDeps): FileEditorFlow {
  let gateway = deps.gateway
  let current: FileEditorView = { phase: 'closed' }
  let generation = 0
  const listeners = new Set<(view: FileEditorView) => void>()

  function set(next: FileEditorView): void {
    current = next
    for (const listener of [...listeners]) listener(current)
  }

  // Why: a function boundary stops TS from keeping the pre-await narrowing of `current`.
  const isStillOpen = (): boolean => current.phase === 'open'

  return {
    view: () => current,
    isOpen: isStillOpen,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    async open(nodeId, path) {
      if (current.phase === 'open') return
      const own = ++generation
      const base = {
        phase: 'open' as const,
        nodeId,
        path,
        content: '',
        readOnly: null,
        error: null
      }
      set({ ...base, status: 'loading' })
      let next: FileEditorView
      try {
        const read = await gateway.filesRead(nodeId, path)
        next = {
          ...base,
          status: 'ready',
          content: read.content,
          readOnly: read.truncated ? 'truncated' : null
        }
      } catch (error) {
        next = isBinaryRefusal(error)
          ? { ...base, status: 'ready', readOnly: 'binary' }
          : { ...base, status: 'error', error: messageOf(error) }
      }
      if (own === generation && isStillOpen()) set(next)
    },
    requestClose() {
      if (current.phase !== 'open') return false
      generation += 1
      set({ phase: 'closed' })
      return true
    },
    rebindGateway(next) {
      gateway = next
    }
  }
}
