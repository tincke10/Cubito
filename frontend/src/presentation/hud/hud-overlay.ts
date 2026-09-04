import type { ConnectionDotTone, HudModel } from './hud-model'

/** Semantic tone → CSS custom property (kebab convention from theme/css-theme.ts's cssVarsFor). */
const DOT_VAR: Record<ConnectionDotTone, string> = {
  accent: '--cubito-accent',
  amber: '--cubito-amber',
  amberDim: '--cubito-amber-dim'
}

const REPO_PLACEHOLDER = 'sin repositorio'

const inert = (element: HTMLElement): HTMLElement => {
  element.style.pointerEvents = 'none'
  return element
}

export type HudOverlayHandle = {
  readonly root: HTMLElement
  apply(model: HudModel): void
  dispose(): void
}

/**
 * DOM overlay fed exclusively by HudModel (design §7.4 — no hex, only cubito CSS vars;
 * apply() takes nothing else — no application-layer state, no raw graph).
 */
export function createHudOverlay(doc: Document = document): HudOverlayHandle {
  const root = inert(doc.createElement('div'))
  root.className = 'cubito-hud'

  const connectionLine = inert(doc.createElement('div'))
  connectionLine.className = 'cubito-hud__line cubito-hud__line--glow'
  const connectionDot = inert(doc.createElement('span'))
  connectionDot.className = 'cubito-hud__dot'
  const connectionText = inert(doc.createElement('span'))
  connectionLine.appendChild(connectionDot)
  connectionLine.appendChild(connectionText)

  const repoLine = inert(doc.createElement('div'))
  repoLine.className = 'cubito-hud__line'

  const countersLine = inert(doc.createElement('div'))
  countersLine.className = 'cubito-hud__line'
  const countersPrefix = inert(doc.createElement('span'))
  const countersWaiting = inert(doc.createElement('span'))
  countersWaiting.className = 'pulse'
  countersLine.appendChild(countersPrefix)
  countersLine.appendChild(countersWaiting)

  root.appendChild(connectionLine)
  root.appendChild(repoLine)
  root.appendChild(countersLine)

  return {
    root,
    apply(model: HudModel) {
      connectionDot.style.backgroundColor = `var(${DOT_VAR[model.connection.dotColor]})`
      connectionText.textContent = model.connection.label

      repoLine.textContent =
        model.repo === null
          ? REPO_PLACEHOLDER
          : `${model.repo.displayName} · ${model.repo.nodeCount} nodos`

      countersPrefix.textContent = `${model.counters.total} nodos · ${model.counters.working} agentes activos · `
      countersWaiting.textContent = `${model.counters.waitingInput} esperando input`
    },
    dispose() {
      root.remove()
    }
  }
}
