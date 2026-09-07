import type { WorktreeId } from '../domain/worktree-graph/types'
import type { DiffFileContent } from './ports/runtime-gateway'

export type DiffRailStatus = 'loading' | 'ready' | 'empty' | 'error'

/** One row in the diff rail — from a BranchCompare entry. */
export type DiffFileRow = { path: string; status: string; added: number; removed: number }

export type DiffPanelState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'text'; originalContent: string; modifiedContent: string; truncated: boolean }
  | { kind: 'binary'; modifiedDeleted?: boolean }
  | { kind: 'error'; message?: string }

/** closed → open (anchored to a node+baseRef; rail/panel fill in via rail-loaded/panel-loaded). */
export type DiffViewSlice =
  | { view: 'closed' }
  | {
      view: 'open'
      focusedNodeId: WorktreeId
      baseRef: string
      compare: { headOid: string; mergeBase: string } | null
      status: DiffRailStatus
      errorMessage?: string
      files: readonly DiffFileRow[]
      selectedPath: string | null
      panel: DiffPanelState
    }

export const emptyDiffViewSlice = (): DiffViewSlice => ({ view: 'closed' })

export type DiffViewAction =
  | { type: 'open'; nodeId: WorktreeId; baseRef: string }
  | { type: 'open-error'; message?: string }
  | {
      type: 'rail-loaded'
      compare: { headOid: string; mergeBase: string }
      files: readonly DiffFileRow[]
    }
  | { type: 'rail-error'; message?: string }
  | { type: 'select'; path: string }
  | { type: 'panel-loaded'; path: string; content: DiffFileContent }
  | { type: 'panel-error'; path: string; message?: string }
  | { type: 'close' }

export function reduceDiffView(slice: DiffViewSlice, action: DiffViewAction): DiffViewSlice {
  switch (action.type) {
    case 'open':
      return {
        view: 'open',
        focusedNodeId: action.nodeId,
        baseRef: action.baseRef,
        compare: null,
        status: 'loading',
        files: [],
        selectedPath: null,
        panel: { kind: 'idle' }
      }
    case 'close':
      return { view: 'closed' }
    // open-error: base-ref resolution failed before the rail fetch even ran (unknown base).
    case 'open-error':
    case 'rail-error':
      return slice.view === 'open'
        ? {
            ...slice,
            status: 'error',
            ...(action.message === undefined ? {} : { errorMessage: action.message })
          }
        : slice
    case 'rail-loaded':
      return slice.view === 'open'
        ? {
            ...slice,
            compare: action.compare,
            files: action.files,
            status: action.files.length === 0 ? 'empty' : 'ready'
          }
        : slice
    case 'select':
      return slice.view === 'open'
        ? { ...slice, selectedPath: action.path, panel: { kind: 'loading' } }
        : slice
    case 'panel-loaded':
      return slice.view === 'open' && slice.selectedPath === action.path
        ? { ...slice, panel: toPanelState(action.content) }
        : slice
    case 'panel-error':
      return slice.view === 'open' && slice.selectedPath === action.path
        ? {
            ...slice,
            panel:
              action.message === undefined
                ? { kind: 'error' }
                : { kind: 'error', message: action.message }
          }
        : slice
    default:
      return slice
  }
}

/** Exported for compare-child-load.ts (Change D) — identical per-file panel projection, reused verbatim. */
export function toPanelState(content: DiffFileContent): DiffPanelState {
  return content.kind === 'text'
    ? {
        kind: 'text',
        originalContent: content.originalContent,
        modifiedContent: content.modifiedContent,
        truncated: content.truncated
      }
    : content.modifiedDeleted === undefined
      ? { kind: 'binary' }
      : { kind: 'binary', modifiedDeleted: content.modifiedDeleted }
}

export type DiffHudCounts = { files: number; added: number; removed: number }

const emptyDiffHudCounts = (): DiffHudCounts => ({ files: 0, added: 0, removed: 0 })

/** File/added/removed totals over any DiffFileRow list — reused by compare-rail-model.ts (Change D)
 *  for the per-child stat, since a compare child's files list isn't wrapped in a DiffViewSlice. */
export function hudCountsOfFiles(files: readonly DiffFileRow[]): DiffHudCounts {
  return files.reduce(
    (acc, file) => ({
      files: acc.files + 1,
      added: acc.added + file.added,
      removed: acc.removed + file.removed
    }),
    emptyDiffHudCounts()
  )
}

/** HUD copy: file/added/removed totals across the rail's files list. */
export function diffHudCounts(slice: DiffViewSlice): DiffHudCounts {
  if (slice.view !== 'open') return emptyDiffHudCounts()
  return hudCountsOfFiles(slice.files)
}
