import type { ConnectionState } from '../../application/scene-store'
import type { CompareViewSlice } from '../../application/compare-view-model'
import type { WorktreeId } from '../../domain/worktree-graph/types'
import { compareRailViewModel } from './compare-rail-model'
import { diffRailViewModel } from '../diff/diff-rail-model'
import { diffPanelViewModel } from '../diff/diff-panel-model'
import type { CompareRailHandle } from './compare-rail-element'
import type { CompareHudHandle } from './compare-hud-element'
import type { CompareMergeActionHandle } from './compare-merge-action-element'
import type { DiffRailHandle } from '../diff/diff-rail-element'
import type { DiffPanelHandle } from '../diff/diff-panel-element'

export type CompareViewControllerDeps = {
  createChildRail: () => CompareRailHandle
  /** Reused verbatim from diff mode — shows the focused child's changed files (middle column). */
  createFileRail: () => DiffRailHandle
  /** Reused verbatim from diff mode — shows the selected file's unified diff (right column). */
  createPanel: () => DiffPanelHandle
  createHud: () => CompareHudHandle
  /** Winner-merge action (Change E) — a real interactive button, not a keyboard-bar chip. */
  createMergeAction: () => CompareMergeActionHandle
  /** The `#compare` slot — this controller mounts/unmounts into it and nothing else DOM-wise. */
  hud: { appendChild(element: unknown): void }
  /** Shared `#keyboard-bar` slot the worktree HUD's own bar already occupies. */
  keyboardBarSlot: { appendChild(element: unknown): void }
  /** Forwards a child-rail row click to the live loader/store (focus that child). */
  onFocusChild: (childId: WorktreeId) => void
  /** Forwards the winner-toggle click (record-only — set or clear the winner). */
  onSetWinner: (childId: WorktreeId | null) => void
  /** Forwards a file-rail row click to the live loader (`loader.select(childId, path)`). */
  onSelectFile: (path: string) => void
  /** Forwards the merge action's 2nd-click fire (never the 1st, arm-only) to the merge runner,
   *  with the sync checkbox's value (v3-2). */
  onMergeWinner: (syncWorkingTree: boolean) => void
  /** Fires once on the closed->open transition, after mounting — the seam for hiding the
   *  worktree HUD/keyboard-bar/3D scene, keeping this controller DOM-scoped to #compare. */
  onEnter?: () => void
  /** Fires once on the open->closed transition, after unmounting — restores worktree chrome. */
  onExit?: () => void
}

export type CompareViewController = {
  sync(
    compareView: CompareViewSlice,
    connection: ConnectionState,
    branchLabelFor: (childId: WorktreeId) => string,
    /** Whether the host advertises `git.merge-winner.v1` — gates the merge action's button. */
    mergeCapable: boolean,
    /** Whether the host advertises `git.merge-winner.sync.v1` (v3-2) — gates the sync checkbox. */
    mergeSyncCapable?: boolean
  ): void
  dispose(): void
}

type Mounted = {
  childRail: CompareRailHandle
  fileRail: DiffRailHandle
  panel: DiffPanelHandle
  hud: CompareHudHandle
  mergeAction: CompareMergeActionHandle
}

/**
 * Mirrors diff-view-controller.ts's mount/unmount-on-slice-transition lifecycle, extended to a
 * rail-of-rails: the NEW child rail (litter overview) drives which child's already-loaded files
 * the REUSED file rail and panel show. Drives nothing about the live loader itself —
 * bind-compare-view.ts starts/stops/selects on that alongside this controller's sync.
 */
export function createCompareViewController(
  deps: CompareViewControllerDeps
): CompareViewController {
  let mounted: Mounted | null = null

  const mount = (): Mounted => {
    const childRail = deps.createChildRail()
    const fileRail = deps.createFileRail()
    const panel = deps.createPanel()
    const hud = deps.createHud()
    const mergeAction = deps.createMergeAction()
    childRail.onFocusChild((childId) => deps.onFocusChild(childId))
    childRail.onSetWinner((childId) => deps.onSetWinner(childId))
    fileRail.onSelect((path) => deps.onSelectFile(path))
    mergeAction.onMergeWinner((syncWorkingTree) => deps.onMergeWinner(syncWorkingTree))
    deps.hud.appendChild(hud.root)
    deps.hud.appendChild(childRail.root)
    deps.hud.appendChild(fileRail.root)
    deps.hud.appendChild(panel.element)
    deps.hud.appendChild(mergeAction.root)
    deps.keyboardBarSlot.appendChild(hud.keyboardBar.root)
    const entry: Mounted = { childRail, fileRail, panel, hud, mergeAction }
    mounted = entry
    return entry
  }

  const unmount = (): void => {
    if (!mounted) return
    mounted.childRail.dispose()
    mounted.fileRail.dispose()
    mounted.panel.dispose()
    mounted.hud.dispose()
    mounted.mergeAction.dispose()
    mounted = null
  }

  return {
    sync(compareView, connection, branchLabelFor, mergeCapable, mergeSyncCapable = false) {
      if (compareView.view !== 'open') {
        if (mounted) {
          unmount()
          deps.onExit?.()
        }
        return
      }
      const enteringNow = !mounted
      const entry = mounted ?? mount()
      if (enteringNow) deps.onEnter?.()

      entry.childRail.apply(
        compareRailViewModel({
          members: compareView.members,
          childLoads: compareView.childLoads,
          focusedChildId: compareView.focusedChildId,
          winnerId: compareView.winnerId,
          branchLabelFor
        })
      )

      const focusedLoad =
        compareView.focusedChildId !== null
          ? compareView.childLoads[compareView.focusedChildId]
          : undefined
      entry.fileRail.apply(
        diffRailViewModel(focusedLoad?.files ?? [], focusedLoad?.selectedPath ?? null)
      )
      entry.panel.apply(diffPanelViewModel(focusedLoad?.panel ?? { kind: 'idle' }))

      entry.hud.apply({
        connection,
        membersCount: compareView.members.length,
        winnerLabel: compareView.winnerId !== null ? branchLabelFor(compareView.winnerId) : null
      })

      entry.mergeAction.apply({
        visible: compareView.winnerId !== null,
        capable: mergeCapable,
        syncCapable: mergeSyncCapable,
        merge: compareView.merge
      })
    },
    dispose(): void {
      unmount()
    }
  }
}
