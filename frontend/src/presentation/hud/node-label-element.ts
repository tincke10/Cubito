import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js'
import type { LabelTone, NodeLabelModel } from './node-label-model'

/** Semantic tone → CSS custom property (kebab convention from theme/css-theme.ts's cssVarsFor). */
const TONE_VAR: Record<LabelTone, string> = {
  accent: '--cubito-accent',
  primary: '--cubito-text-primary',
  dim: '--cubito-text-dim',
  faint: '--cubito-text-faint',
  amber: '--cubito-amber',
  amberDim: '--cubito-amber-dim',
  info: '--cubito-info'
}

type Line = { text: string; tone: LabelTone }

const applyLine = (element: HTMLElement, line: Line | null): void => {
  element.style.display = line === null ? 'none' : ''
  if (line === null) return
  element.textContent = line.text
  element.style.color = `var(${TONE_VAR[line.tone]})`
}

export type NodeLabelHandle = {
  readonly object: CSS2DObject
  apply(model: NodeLabelModel): void
  dispose(): void
}

/**
 * Thin CSS2DObject-backed label (design §3, Decision 2). Untestable under
 * `environment:'node'` (no `document`) — content/tone logic lives entirely in
 * node-label-model.ts; this file only paints it.
 */
export function createNodeLabel(): NodeLabelHandle {
  const root = document.createElement('div')
  root.className = 'cubito-node-label'
  root.style.pointerEvents = 'none'
  root.style.textAlign = 'center'
  root.style.whiteSpace = 'nowrap'
  root.style.fontFamily = "'Fira Code', monospace"

  // CSS2DRenderer overwrites `root.style.transform` every frame to position the
  // object on screen, so the mockup's fixed +26px-below-shadow offset lives on an
  // inner wrapper instead — setting it on `root` would be clobbered each frame.
  const inner = document.createElement('div')
  inner.style.transform = 'translate(-50%, 26px)'
  root.appendChild(inner)

  const primary = document.createElement('div')
  const secondary = document.createElement('div')
  const callout = document.createElement('div')
  const calloutTitle = document.createElement('div')
  const calloutHint = document.createElement('div')
  callout.appendChild(calloutTitle)
  callout.appendChild(calloutHint)
  inner.appendChild(primary)
  inner.appendChild(secondary)
  inner.appendChild(callout)

  const object = new CSS2DObject(root)

  return {
    object,
    apply(model: NodeLabelModel) {
      applyLine(primary, model.primary)
      applyLine(secondary, model.secondary)
      callout.style.display = model.callout === null ? 'none' : ''
      if (model.callout !== null) {
        applyLine(calloutTitle, model.callout.title)
        applyLine(calloutHint, model.callout.hint)
      }
    },
    dispose() {
      root.remove()
    }
  }
}
