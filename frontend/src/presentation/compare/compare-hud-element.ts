import { connectionDotColor, connectionLabel } from '../hud/hud-model'
import { createKeyboardBar } from '../hud/keyboard-bar'
import type { ConnectionDotTone, HudChip } from '../hud/hud-model'
import type { KeyboardBarHandle } from '../hud/keyboard-bar'
import type { ConnectionState } from '../../application/scene-store'

/** Tone -> CSS custom property (mirrors diff-hud-element.ts's own private DOT_VAR table). */
const DOT_VAR: Record<ConnectionDotTone, string> = {
  accent: '--cubito-accent',
  amber: '--cubito-amber',
  amberDim: '--cubito-amber-dim'
}

const MODE_SUFFIX = 'comparar la camada'
const NO_WINNER_TEXT = 'sin elegir'

/** Same [g][x][d][t] mode switcher every scene-replacing mode renders, plus this mode's own 'c'. */
const COMPARE_KEYBOARD_CHIPS: readonly HudChip[] = [
  { key: 'g', description: 'grafo de worktrees' },
  { key: 'x', description: 'sistema en vivo' },
  { key: 'd', description: 'diff' },
  { key: 'c', description: 'comparar la camada' },
  { key: 't', description: 'terminal' }
]

export type CompareHudModel = {
  connection: ConnectionState
  membersCount: number
  /** The current winner's display label, or null while none is picked. */
  winnerLabel: string | null
}

export type CompareHudHandle = {
  readonly root: HTMLElement
  readonly keyboardBar: KeyboardBarHandle
  apply(model: CompareHudModel): void
  dispose(): void
}

/**
 * Compare mode's 3-line HUD (mirrors diff-hud-element.ts): connection · mode · litter size and
 * winner. Reuses hud-model.ts's connectionLabel/connectionDotColor and keyboard-bar.ts's chip
 * renderer; the keyboard bar mounts at its own slot, exposed separately from this root.
 */
export function createCompareHud(doc: Document = document): CompareHudHandle {
  const root = doc.createElement('div')
  root.className = 'cubito-compare-hud'
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
  modeLine.textContent = MODE_SUFFIX

  const winnerLine = doc.createElement('div')
  winnerLine.className = 'cubito-hud__line'

  root.appendChild(connectionLine)
  root.appendChild(modeLine)
  root.appendChild(winnerLine)

  const keyboardBar = createKeyboardBar(doc)
  keyboardBar.apply(COMPARE_KEYBOARD_CHIPS)

  return {
    root,
    keyboardBar,
    apply(model: CompareHudModel) {
      connectionDot.style.backgroundColor = `var(${DOT_VAR[connectionDotColor(model.connection)]})`
      connectionText.textContent = connectionLabel(model.connection)
      winnerLine.textContent = `${model.membersCount} hijos · ganador: ${model.winnerLabel ?? NO_WINNER_TEXT}`
    },
    dispose() {
      root.remove()
      keyboardBar.dispose()
    }
  }
}
