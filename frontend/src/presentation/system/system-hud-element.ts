import { connectionDotColor, connectionLabel } from '../hud/hud-model'
import { createKeyboardBar } from '../hud/keyboard-bar'
import type { ConnectionDotTone, HudChip } from '../hud/hud-model'
import type { KeyboardBarHandle } from '../hud/keyboard-bar'
import type { ConnectionState } from '../../application/scene-store'
import type { SystemHudCounts } from '../../application/system-view-model'

/** Tone -> CSS custom property (mirrors hud-overlay.ts's own private DOT_VAR table). */
const DOT_VAR: Record<ConnectionDotTone, string> = {
  accent: '--cubito-accent',
  amber: '--cubito-amber',
  amberDim: '--cubito-amber-dim'
}

const MODE_SUFFIX = 'sistema en vivo'

/** The mode's own [g][x][d][t] switcher, per VistaSistema.dc.html's keyboard bar — distinct
 *  from the worktree graph's hjkl/f/v/s bar (hud-model.ts's chipsFor). */
const SYSTEM_KEYBOARD_CHIPS: readonly HudChip[] = [
  { key: 'g', description: 'grafo de worktrees' },
  { key: 'x', description: 'sistema en vivo' },
  { key: 'd', description: 'diff' },
  { key: 't', description: 'terminal' }
]

export type SystemHudModel = {
  connection: ConnectionState
  branch: string
  counts: SystemHudCounts
}

export type SystemHudHandle = {
  readonly root: HTMLElement
  readonly keyboardBar: KeyboardBarHandle
  apply(model: SystemHudModel): void
  dispose(): void
}

/**
 * Sistema-en-vivo's own 3-line HUD (design chose a separate block, not the mode-aware shared
 * worktree HUD): connection · branch · agent-activity counters. Reuses hud-model.ts's
 * connectionLabel/connectionDotColor and keyboard-bar.ts's chip renderer — the keyboard bar is
 * exposed separately since it mounts at its own `#keyboard-bar` slot, not inside this root.
 */
export function createSystemHud(doc: Document = document): SystemHudHandle {
  const root = doc.createElement('div')
  root.className = 'cubito-system-hud'
  root.style.pointerEvents = 'none'

  const connectionLine = doc.createElement('div')
  connectionLine.className = 'cubito-hud__line cubito-hud__line--glow'
  const connectionDot = doc.createElement('span')
  connectionDot.className = 'cubito-hud__dot'
  const connectionText = doc.createElement('span')
  connectionLine.appendChild(connectionDot)
  connectionLine.appendChild(connectionText)

  const modeLine = doc.createElement('div')
  modeLine.className = 'cubito-hud__line'

  const countersLine = doc.createElement('div')
  countersLine.className = 'cubito-hud__line'
  const editingLabel = doc.createElement('span')
  editingLabel.className = 'cubito-system-hud__label'
  editingLabel.textContent = 'claude editando'
  const countersRest = doc.createElement('span')
  countersLine.appendChild(editingLabel)
  countersLine.appendChild(countersRest)

  root.appendChild(connectionLine)
  root.appendChild(modeLine)
  root.appendChild(countersLine)

  const keyboardBar = createKeyboardBar(doc)
  keyboardBar.apply(SYSTEM_KEYBOARD_CHIPS)

  return {
    root,
    keyboardBar,
    apply(model: SystemHudModel) {
      connectionDot.style.backgroundColor = `var(${DOT_VAR[connectionDotColor(model.connection)]})`
      connectionText.textContent = connectionLabel(model.connection)
      modeLine.textContent = `${model.branch} · ${MODE_SUFFIX}`
      countersRest.textContent = ` · ${model.counts.tocados} endpoints tocados · ${model.counts.nuevo} nuevo`
    },
    dispose() {
      root.remove()
      keyboardBar.dispose()
    }
  }
}
