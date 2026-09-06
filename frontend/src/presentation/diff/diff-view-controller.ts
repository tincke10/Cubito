import type { ConnectionState } from '../../application/scene-store'
import { diffHudCounts } from '../../application/diff-view-model'
import type { DiffViewSlice } from '../../application/diff-view-model'
import { diffRailViewModel } from './diff-rail-model'
import { diffPanelViewModel } from './diff-panel-model'
import type { DiffRailHandle } from './diff-rail-element'
import type { DiffPanelHandle } from './diff-panel-element'
import type { DiffHudHandle } from './diff-hud-element'

export type DiffViewControllerDeps = {
  createRail: () => DiffRailHandle
  createPanel: () => DiffPanelHandle
  createHud: () => DiffHudHandle
  /** The `#diff` slot — this controller mounts/unmounts into it and nothing else DOM-wise. */
  hud: { appendChild(element: unknown): void }
  /** Shared `#keyboard-bar` slot the worktree HUD's own bar already occupies. */
  keyboardBarSlot: { appendChild(element: unknown): void }
  /** Forwards a rail row click to the live loader (`loader.select(path)`), wired on mount. */
  onSelect: (path: string) => void
  /** Fires once on the closed->open transition, after mounting — the seam for hiding the
   *  worktree HUD/keyboard-bar/3D scene, keeping this controller DOM-scoped to #diff. */
  onEnter?: () => void
  /** Fires once on the open->closed transition, after unmounting — restores worktree chrome. */
  onExit?: () => void
}

export type DiffViewController = {
  sync(diffView: DiffViewSlice, connection: ConnectionState, branchLabel: string): void
  dispose(): void
}

type Mounted = { rail: DiffRailHandle; panel: DiffPanelHandle; hud: DiffHudHandle }

/**
 * Mirrors system-view-controller.ts's mount/unmount-on-slice-transition lifecycle for the
 * diff view. Drives nothing about the live loader itself — bind-diff-view.ts starts/stops/
 * selects on that alongside this controller's sync.
 */
export function createDiffViewController(deps: DiffViewControllerDeps): DiffViewController {
  let mounted: Mounted | null = null

  const mount = (): Mounted => {
    const rail = deps.createRail()
    const panel = deps.createPanel()
    const hud = deps.createHud()
    rail.onSelect((path) => deps.onSelect(path))
    deps.hud.appendChild(hud.root)
    deps.hud.appendChild(rail.root)
    deps.hud.appendChild(panel.element)
    deps.keyboardBarSlot.appendChild(hud.keyboardBar.root)
    const entry: Mounted = { rail, panel, hud }
    mounted = entry
    return entry
  }

  const unmount = (): void => {
    if (!mounted) return
    mounted.rail.dispose()
    mounted.panel.dispose()
    mounted.hud.dispose()
    mounted = null
  }

  return {
    sync(diffView, connection, branchLabel) {
      if (diffView.view !== 'open') {
        if (mounted) {
          unmount()
          deps.onExit?.()
        }
        return
      }
      const enteringNow = !mounted
      const entry = mounted ?? mount()
      if (enteringNow) deps.onEnter?.()
      entry.rail.apply(diffRailViewModel(diffView.files, diffView.selectedPath))
      entry.panel.apply(diffPanelViewModel(diffView.panel))
      entry.hud.apply({ connection, branch: branchLabel, counts: diffHudCounts(diffView) })
    },
    dispose(): void {
      unmount()
    }
  }
}
