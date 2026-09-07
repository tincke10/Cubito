import type { WorktreeId } from '../domain/worktree-graph/types'
import type { DiffFileRow, DiffPanelState, DiffRailStatus } from './diff-view-model'
import { toPanelState } from './diff-view-model'
import type { DiffFileContent } from './ports/runtime-gateway'

/** Split out of compare-view-model.ts (max-lines) — one litter child's diff-shaped load. Reuses
 *  diff mode's types verbatim; keyed by childId at the compareView reducer's call site, so this
 *  reducer never needs to know about the other litter members. */
export type CompareChildLoad = {
  baseRef: string
  status: DiffRailStatus
  errorMessage?: string
  compare: { headOid: string; mergeBase: string } | null
  files: readonly DiffFileRow[]
  selectedPath: string | null
  panel: DiffPanelState
}

export const emptyCompareChildLoad = (): CompareChildLoad => ({
  baseRef: '',
  status: 'loading',
  compare: null,
  files: [],
  selectedPath: null,
  panel: { kind: 'idle' }
})

export type CompareChildLoadAction =
  | { type: 'select-file'; childId: WorktreeId; path: string }
  | {
      type: 'child-rail-loaded'
      childId: WorktreeId
      compare: { headOid: string; mergeBase: string }
      files: readonly DiffFileRow[]
    }
  | { type: 'child-rail-error'; childId: WorktreeId; message?: string }
  | { type: 'child-panel-loaded'; childId: WorktreeId; path: string; content: DiffFileContent }
  | { type: 'child-panel-error'; childId: WorktreeId; path: string; message?: string }

export function reduceCompareChildLoad(
  load: CompareChildLoad,
  action: CompareChildLoadAction
): CompareChildLoad {
  switch (action.type) {
    case 'child-rail-loaded':
      return {
        ...load,
        compare: action.compare,
        files: action.files,
        status: action.files.length === 0 ? 'empty' : 'ready'
      }
    case 'child-rail-error':
      return {
        ...load,
        status: 'error',
        ...(action.message === undefined ? {} : { errorMessage: action.message })
      }
    case 'select-file':
      return { ...load, selectedPath: action.path, panel: { kind: 'loading' } }
    case 'child-panel-loaded':
      return load.selectedPath === action.path
        ? { ...load, panel: toPanelState(action.content) }
        : load
    case 'child-panel-error':
      return load.selectedPath === action.path
        ? {
            ...load,
            panel:
              action.message === undefined
                ? { kind: 'error' }
                : { kind: 'error', message: action.message }
          }
        : load
    default:
      return load
  }
}
