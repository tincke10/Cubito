import type { WorktreeId } from '../../domain/worktree-graph/types'
import type { CompareChildLoad } from '../../application/compare-child-load'
import { hudCountsOfFiles } from '../../application/diff-view-model'
import type { DiffRailStatus } from '../../application/diff-view-model'
import { diffRailFailure } from '../diff/diff-rail-model'
import type { FailureMessage } from '../../application/i18n/user-facing-error'
import { shortBranchName } from '../hud/node-label-model'
import { t, tn } from '../../application/i18n/translate'

export type CompareRailRow = {
  childId: WorktreeId
  label: string
  /** Full ref, for the label's title tooltip — label itself is stripped of refs/heads/. */
  title: string
  statText: string
  status: DiffRailStatus
  focused: boolean
  isWinner: boolean
  cssClass: string
  winnerToggleLabel: string
  /** Set only when this child's rail load errored — shown instead of a misleading "0 files". */
  failure: FailureMessage | null
}

export type CompareRailInput = {
  members: readonly WorktreeId[]
  childLoads: Readonly<Record<WorktreeId, CompareChildLoad>>
  focusedChildId: WorktreeId | null
  winnerId: WorktreeId | null
  /** Resolves a child's display branch — the graph lookup lives in bind-compare-view.ts, not here. */
  branchLabelFor: (childId: WorktreeId) => string
}

const railCssClass = (status: DiffRailStatus, focused: boolean, isWinner: boolean): string =>
  `compare-rail__row compare-rail__row--${status}` +
  (focused ? ' compare-rail__row--focused' : '') +
  (isWinner ? ' compare-rail__row--winner' : '')

/** Pure projection of compare mode's child rail — one row per litter member (the parent is
 *  already dropped by the caller). Stats reuse diff mode's hudCountsOfFiles verbatim; focus and
 *  winner are membership tests against the slice's own focusedChildId/winnerId. No DOM. */
export function compareRailViewModel(input: CompareRailInput): readonly CompareRailRow[] {
  return input.members.map((childId) => {
    const load = input.childLoads[childId]
    const counts = load ? hudCountsOfFiles(load.files) : { files: 0, added: 0, removed: 0 }
    const status = load?.status ?? 'loading'
    const focused = childId === input.focusedChildId
    const isWinner = childId === input.winnerId
    const full = input.branchLabelFor(childId)
    return {
      childId,
      label: shortBranchName(full),
      title: full,
      statText: t('compare.railStats', {
        ...counts,
        files: tn('compare.railFiles', counts.files)
      }),
      status,
      focused,
      isWinner,
      cssClass: railCssClass(status, focused, isWinner),
      winnerToggleLabel: isWinner ? t('compare.winner') : t('compare.pickWinner'),
      failure: diffRailFailure(status, load?.errorMessage)
    }
  })
}
