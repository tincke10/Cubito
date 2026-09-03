import type { ScreenPoint } from './terminal-connector-projector'

const SVG_NS = 'http://www.w3.org/2000/svg'

export type TerminalConnectorHandle = {
  readonly svg: SVGSVGElement
  apply(from: ScreenPoint, to: ScreenPoint): void
  hide(): void
  dispose(): void
}

/**
 * Dashed SVG line from a node's screen projection to its in-scene terminal panel
 * (design Area 6). Untestable like node-label-element.ts (needs `document`/SVG DOM);
 * the projection math it renders lives in terminal-connector-projector.ts, tested there.
 */
export function createTerminalConnector(): TerminalConnectorHandle {
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('class', 'cubito-terminal-connector')
  svg.style.position = 'absolute'
  svg.style.inset = '0'
  svg.style.pointerEvents = 'none'
  svg.style.width = '100%'
  svg.style.height = '100%'

  const line = document.createElementNS(SVG_NS, 'line')
  line.setAttribute('stroke', 'var(--cubito-info)')
  line.setAttribute('stroke-dasharray', '4 4')
  line.style.display = 'none'
  svg.appendChild(line)

  return {
    svg,
    apply(from: ScreenPoint, to: ScreenPoint) {
      const visible = from.visible && to.visible
      line.style.display = visible ? '' : 'none'
      if (!visible) return
      line.setAttribute('x1', String(from.x))
      line.setAttribute('y1', String(from.y))
      line.setAttribute('x2', String(to.x))
      line.setAttribute('y2', String(to.y))
    },
    hide() {
      line.style.display = 'none'
    },
    dispose() {
      svg.remove()
    }
  }
}
