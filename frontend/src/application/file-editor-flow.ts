import type { WorktreeId } from '../domain/worktree-graph/types'
import type { FileStamp, RuntimeGateway } from './ports/runtime-gateway'

export type FileEditorGatewayPort = Pick<RuntimeGateway, 'filesRead' | 'filesStat' | 'filesWrite'>

export type FileReadOnlyReason = 'truncated' | 'binary'

/** `changed`: the file differs on disk; `unverifiable`: the host could not be asked (never assume safe). */
export type FileEditConflict = { reason: 'changed' | 'unverifiable' }

type OpenView = {
  phase: 'open'
  nodeId: WorktreeId
  path: string
  status: 'loading' | 'ready' | 'error'
  content: string
  readOnly: FileReadOnlyReason | null
  dirty: boolean
  saving: boolean
  /** Reloading from disk after the user chose "recargar". */
  reloading: boolean
  notice: string | null
  error: string | null
  conflict: FileEditConflict | null
  confirmDiscard: boolean
}

export type FileEditorView = { phase: 'closed' } | OpenView

export type FileEditorDeps = {
  gateway: FileEditorGatewayPort
  /** Fired after a successful write so diff/status can refresh. */
  onSaved(nodeId: WorktreeId, path: string): void
  /** Execution host of a node; writes must name it (the host refuses otherwise). */
  hostIdOf?(nodeId: WorktreeId): string | undefined
}

export type FileEditorFlow = {
  view(): FileEditorView
  subscribe(listener: (view: FileEditorView) => void): () => void
  isOpen(): boolean
  open(nodeId: WorktreeId, path: string): Promise<void>
  edit(content: string): void
  save(): Promise<void>
  resolveConflict(choice: 'reload' | 'overwrite'): Promise<void>
  /** True when the key was consumed: closed, asked to confirm, or backed out of the confirm. */
  requestClose(): boolean
  keepEditing(): void
  discard(): void
  rebindGateway(gateway: FileEditorGatewayPort): void
}

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

// Why: the host reports binary paths as a plain Error message, not a structured code.
const isBinaryRefusal = (error: unknown): boolean => messageOf(error) === 'binary_file'

const sameStamp = (a: FileStamp, b: FileStamp): boolean => a.size === b.size && a.mtime === b.mtime

const editable = (view: FileEditorView): view is OpenView =>
  view.phase === 'open' && view.status === 'ready' && view.readOnly === null

export function createFileEditorFlow(deps: FileEditorDeps): FileEditorFlow {
  let gateway = deps.gateway
  let current: FileEditorView = { phase: 'closed' }
  let generation = 0
  // Why: files.write has no host-side check, so the stamp taken at open/save is the only baseline.
  let baseline: FileStamp | null = null
  let savedContent = ''
  const listeners = new Set<(view: FileEditorView) => void>()
  // Why: a function boundary stops TS from keeping the pre-await narrowing of `current`.
  const isStillOpen = (): boolean => current.phase === 'open'

  function set(next: FileEditorView): void {
    current = next
    for (const listener of [...listeners]) listener(current)
  }

  function patch(fields: Partial<OpenView>): void {
    if (current.phase !== 'open') return
    const next = { ...current, ...fields }
    set({ ...next, dirty: next.content !== savedContent })
  }

  const stampOrNull = (nodeId: string, path: string): Promise<FileStamp | null> =>
    gateway.filesStat(nodeId, path).catch(() => null)

  /** Stat first, then read: a change in between yields a stale stamp (a safe false conflict). */
  async function load(nodeId: WorktreeId, path: string, own: number): Promise<void> {
    const stamp = await stampOrNull(nodeId, path)
    let fields: Partial<OpenView>
    let text = ''
    try {
      const read = await gateway.filesRead(nodeId, path)
      text = read.content
      // Why: the host only refuses binaries by extension; a NUL means non-text, and saving the
      // lossy utf-8 decode would corrupt the file.
      fields = text.includes('\u0000')
        ? { status: 'ready', readOnly: 'binary', content: '' }
        : { status: 'ready', content: text, readOnly: read.truncated ? 'truncated' : null }
    } catch (error) {
      fields = isBinaryRefusal(error)
        ? { status: 'ready', readOnly: 'binary', content: '' }
        : { status: 'error', error: messageOf(error) }
    }
    if (own !== generation || !isStillOpen()) return
    baseline = stamp
    savedContent = fields.content ?? ''
    patch({ ...fields, reloading: false, conflict: null, error: fields.error ?? null })
  }

  async function write(nodeId: WorktreeId, path: string, content: string): Promise<void> {
    patch({ saving: true, error: null, notice: null })
    try {
      const hostId = deps.hostIdOf?.(nodeId)
      await (hostId
        ? gateway.filesWrite(nodeId, path, content, hostId)
        : gateway.filesWrite(nodeId, path, content))
    } catch (error) {
      patch({ saving: false, error: `no se pudo guardar: ${messageOf(error)}` })
      return
    }
    baseline = await stampOrNull(nodeId, path)
    savedContent = content
    patch({ saving: false, notice: 'guardado', conflict: null })
    deps.onSaved(nodeId, path)
  }

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
      baseline = null
      savedContent = ''
      set({
        phase: 'open',
        nodeId,
        path,
        status: 'loading',
        content: '',
        readOnly: null,
        dirty: false,
        saving: false,
        reloading: false,
        notice: null,
        error: null,
        conflict: null,
        confirmDiscard: false
      })
      await load(nodeId, path, own)
    },
    edit(content) {
      if (!editable(current)) return
      patch({ content, notice: null })
    },
    async save() {
      const view = current
      if (!editable(view) || !view.dirty || view.saving || view.conflict) return
      const { nodeId, path, content } = view
      if (baseline !== null) {
        const latest = await stampOrNull(nodeId, path)
        if (!isStillOpen()) return
        if (latest === null) return patch({ conflict: { reason: 'unverifiable' } })
        if (!sameStamp(latest, baseline)) return patch({ conflict: { reason: 'changed' } })
      }
      await write(nodeId, path, content)
    },
    async resolveConflict(choice) {
      const view = current
      if (view.phase !== 'open' || !view.conflict || view.saving || view.reloading) return
      if (choice === 'overwrite') {
        await write(view.nodeId, view.path, view.content)
        return
      }
      patch({ reloading: true })
      await load(view.nodeId, view.path, generation)
    },
    requestClose() {
      const view = current
      if (view.phase !== 'open') return false
      if (view.saving) return true
      if (view.dirty) {
        patch({ confirmDiscard: !view.confirmDiscard })
        return true
      }
      generation += 1
      set({ phase: 'closed' })
      return true
    },
    keepEditing() {
      patch({ confirmDiscard: false })
    },
    discard() {
      if (current.phase !== 'open') return
      generation += 1
      set({ phase: 'closed' })
    },
    rebindGateway(next) {
      gateway = next
    }
  }
}
