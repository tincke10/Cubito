import { connectionDotColor, connectionLabel } from '../hud/hud-model'
import { createKeyboardBar } from '../hud/keyboard-bar'
import type { ConnectionDotTone, HudChip } from '../hud/hud-model'
import type { KeyboardBarHandle } from '../hud/keyboard-bar'
import type { ConnectionState } from '../../application/scene-store'
import type { DiffHudCounts } from '../../application/diff-view-model'

/** Tone -> CSS custom property (mirrors system-hud-element.ts's own private DOT_VAR table). */
const DOT_VAR: Record<ConnectionDotTone, string> = {
  accent: '--cubito-accent',
  amber: '--cubito-amber',
  amberDim: '--cubito-amber-dim'
}

const MODE_SUFFIX = 'diff'

/** Same [g][x][d][t] mode switcher system-hud-element.ts renders — each mode owns its copy. */
const DIFF_KEYBOARD_CHIPS: readonly HudChip[] = [
  { key: 'g', description: 'grafo de worktrees' },
  { key: 'x', description: 'sistema en vivo' },
  { key: 'd', description: 'diff' },
  { key: 't', description: 'terminal' }
]

export type DiffHudModel = {
  connection: ConnectionState
  branch: string
  counts: DiffHudCounts
}

export type DiffHudHandle = {
  readonly root: HTMLElement
  readonly keyboardBar: KeyboardBarHandle
  apply(model: DiffHudModel): void
  dispose(): void
}

/**
 * Diff mode's 3-line HUD (mirrors system-hud-element.ts): connection · branch · file/+/- totals
 * against base. Reuses hud-model.ts's connectionLabel/connectionDotColor and keyboard-bar.ts's
 * chip renderer; the keyboard bar mounts at its own slot, exposed separately from this root.
 */
export function createDiffHud(doc: Document = document): DiffHudHandle {
  const root = doc.createElement('div')
  root.className = 'cubito-diff-hud'
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

  const countsLine = doc.createElement('div')
  countsLine.className = 'cubito-hud__line'

  root.appendChild(connectionLine)
  root.appendChild(modeLine)
  root.appendChild(countsLine)

  const keyboardBar = createKeyboardBar(doc)
  keyboardBar.apply(DIFF_KEYBOARD_CHIPS)

  return {
    root,
    keyboardBar,
    apply(model: DiffHudModel) {
      connectionDot.style.backgroundColor = `var(${DOT_VAR[connectionDotColor(model.connection)]})`
      connectionText.textContent = connectionLabel(model.connection)
      modeLine.textContent = `${model.branch} · ${MODE_SUFFIX}`
      countsLine.textContent = `${model.counts.files} archivos · +${model.counts.added} −${model.counts.removed} contra base`
    },
    dispose() {
      root.remove()
      keyboardBar.dispose()
    }
  }
}
