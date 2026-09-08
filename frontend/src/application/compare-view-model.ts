import type { WorktreeId } from '../domain/worktree-graph/types'
import type { DiffFileContent, ParentWorkingTreeSyncResult } from './ports/runtime-gateway'
import type { DiffFileRow } from './diff-view-model'
import { emptyCompareChildLoad, reduceCompareChildLoad } from './compare-child-load'
import type { CompareChildLoad, CompareChildLoadAction } from './compare-child-load'

export type { CompareChildLoad }

/** Winner-merge state (Change E) — idle until fired; headless, so `clean` never touches the
 *  parent worktree's working tree unless `workingTree` (v3-2, opt-in) reports otherwise. */
export type CompareMergeState =
  | { phase: 'idle' }
  | { phase: 'running' }
  | { phase: 'clean'; commitOid: string; workingTree?: ParentWorkingTreeSyncResult }
  | { phase: 'conflict'; files: readonly string[] }
  | { phase: 'error'; message: string }

const idleMerge = (): CompareMergeState => ({ phase: 'idle' })

/** closed → open (anchored to the running camada's litter, parent already dropped by the caller). */
export type CompareViewSlice =
  | { view: 'closed' }
  | {
      view: 'open'
      members: readonly WorktreeId[]
      focusedChildId: WorktreeId | null
      winnerId: WorktreeId | null
      merge: CompareMergeState
      childLoads: Record<WorktreeId, CompareChildLoad>
    }

export const emptyCompareViewSlice = (): CompareViewSlice => ({ view: 'closed' })

export type CompareViewAction =
  | { type: 'open'; members: readonly WorktreeId[] }
  | { type: 'focus-child'; childId: WorktreeId }
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
  | { type: 'set-winner'; winnerId: WorktreeId | null }
  | { type: 'merge-start' }
  | { type: 'merge-clean'; commitOid: string; workingTree?: ParentWorkingTreeSyncResult }
  | { type: 'merge-conflict'; files: readonly string[] }
  | { type: 'merge-error'; message: string }
  | { type: 'merge-reset' }
  | { type: 'close' }

const isChildLoadAction = (action: CompareViewAction): action is CompareChildLoadAction =>
  action.type === 'select-file' ||
  action.type === 'child-rail-loaded' ||
  action.type === 'child-rail-error' ||
  action.type === 'child-panel-loaded' ||
  action.type === 'child-panel-error'

export function reduceCompareView(
  slice: CompareViewSlice,
  action: CompareViewAction
): CompareViewSlice {
  switch (action.type) {
    case 'open':
      return {
        view: 'open',
        members: action.members,
        focusedChildId: null,
        winnerId: null,
        merge: idleMerge(),
        childLoads: Object.fromEntries(
          action.members.map((childId) => [childId, emptyCompareChildLoad()])
        )
      }
    case 'close':
      return { view: 'closed' }
    case 'focus-child':
      return slice.view === 'open' ? { ...slice, focusedChildId: action.childId } : slice
    case 'set-winner':
      return slice.view === 'open' ? { ...slice, winnerId: action.winnerId } : slice
    case 'merge-start':
      return slice.view === 'open' ? { ...slice, merge: { phase: 'running' } } : slice
    case 'merge-clean':
      return slice.view === 'open'
        ? {
            ...slice,
            merge: {
              phase: 'clean',
              commitOid: action.commitOid,
              ...(action.workingTree ? { workingTree: action.workingTree } : {})
            }
          }
        : slice
    case 'merge-conflict':
      return slice.view === 'open'
        ? { ...slice, merge: { phase: 'conflict', files: action.files } }
        : slice
    case 'merge-error':
      return slice.view === 'open'
        ? { ...slice, merge: { phase: 'error', message: action.message } }
        : slice
    case 'merge-reset':
      return slice.view === 'open' ? { ...slice, merge: idleMerge() } : slice
    default:
      if (slice.view !== 'open') return slice
      if (isChildLoadAction(action)) {
        const before = slice.childLoads[action.childId]
        if (!before) return slice
        const after = reduceCompareChildLoad(before, action)
        return after === before
          ? slice
          : { ...slice, childLoads: { ...slice.childLoads, [action.childId]: after } }
      }
      return slice
  }
}
