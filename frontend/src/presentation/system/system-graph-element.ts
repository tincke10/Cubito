import type {
  SystemGraphEdgeView,
  SystemGraphNodeView,
  SystemGraphViewModel
} from './system-graph-model'

const SVG_NS = 'http://www.w3.org/2000/svg'

/** Local layout constants (not model data): where sub-texts/box sit inside a node's translated
 *  group, and how edges anchor on box edges. Sourced from VistaSistema.dc.html's rect-relative
 *  text offsets and box dimensions. */
const LABEL_Y = 27
const ANNOTATION_Y = 60
const NOTE_Y_BELOW_DIFF = 76
const METHOD_X = 20
const LABEL_X_WITH_METHOD = 65
const LABEL_X = 0
const BOX_RX = 4

/** db cylinder path/ellipse, verbatim from VistaSistema.dc.html's local 100x130 db svg. */
const DB_BODY_D = 'M12 20 v60 a38 12 0 0 0 76 0 v-60'
const DB_CAP = { cx: 50, cy: 20, rx: 38, ry: 12 }
const DB_LABEL = { x: 50, y: 65 }

const svgEl = (doc: Document, tag: string): SVGElement =>
  doc.createElementNS(SVG_NS, tag) as unknown as SVGElement

const textEl = (
  doc: Document,
  cssClass: string,
  x: number,
  y: number,
  content: string
): SVGElement => {
  const text = svgEl(doc, 'text')
  text.setAttribute('class', cssClass)
  text.setAttribute('x', String(x))
  text.setAttribute('y', String(y))
  text.textContent = content
  return text
}

/** Router/service/database labels are centered over their box; endpoints read left-to-right
 *  beside the method badge — matches the mockup's text-anchor usage. */
const isCenteredLabelKind = (kind: SystemGraphNodeView['kind']): boolean => kind !== 'endpoint'

const buildDatabaseShape = (doc: Document): SVGElement[] => {
  const body = svgEl(doc, 'path')
  body.setAttribute('class', 'system-node__shape')
  body.setAttribute('d', DB_BODY_D)

  const cap = svgEl(doc, 'ellipse')
  cap.setAttribute('class', 'system-node__shape')
  cap.setAttribute('cx', String(DB_CAP.cx))
  cap.setAttribute('cy', String(DB_CAP.cy))
  cap.setAttribute('rx', String(DB_CAP.rx))
  cap.setAttribute('ry', String(DB_CAP.ry))

  return [body, cap]
}

const buildBoxShape = (doc: Document, width: number, height: number): SVGElement => {
  const rect = svgEl(doc, 'rect')
  rect.setAttribute('class', 'system-node__shape')
  rect.setAttribute('x', '0')
  rect.setAttribute('y', '0')
  rect.setAttribute('width', String(width))
  rect.setAttribute('height', String(height))
  rect.setAttribute('rx', String(BOX_RX))
  return rect
}

const buildNodeGroup = (doc: Document, node: SystemGraphNodeView): SVGElement => {
  const group = svgEl(doc, 'g')
  group.setAttribute(
    'class',
    node.highlighted ? `${node.cssClass} system-node--highlighted` : node.cssClass
  )
  group.setAttribute('data-x', String(node.x))
  group.setAttribute('data-y', String(node.y))
  group.setAttribute('transform', `translate(${node.x}, ${node.y})`)

  const shapes =
    node.kind === 'database'
      ? buildDatabaseShape(doc)
      : [buildBoxShape(doc, node.width, node.height)]
  for (const shape of shapes) group.appendChild(shape)

  const centered = isCenteredLabelKind(node.kind)
  const labelX =
    node.method !== undefined ? LABEL_X_WITH_METHOD : centered ? node.width / 2 : LABEL_X
  const labelPos = node.kind === 'database' ? DB_LABEL : { x: labelX, y: LABEL_Y }
  const label = textEl(doc, 'system-node__label', labelPos.x, labelPos.y, node.label)
  if (centered) label.setAttribute('text-anchor', 'middle')
  group.appendChild(label)

  if (node.method !== undefined) {
    group.appendChild(textEl(doc, 'system-node__method', METHOD_X, LABEL_Y, node.method))
  }
  if (node.diff !== null) {
    group.appendChild(
      textEl(
        doc,
        'system-node__diff',
        LABEL_X,
        ANNOTATION_Y,
        `+${node.diff.added} −${node.diff.removed}`
      )
    )
  }
  if (node.note !== undefined) {
    const noteY = node.diff !== null ? NOTE_Y_BELOW_DIFF : ANNOTATION_Y
    group.appendChild(textEl(doc, 'system-node__note', LABEL_X, noteY, node.note))
  }

  return group
}

type EdgeAnchorNode = Pick<SystemGraphNodeView, 'x' | 'y' | 'width' | 'height' | 'kind'>

const BOX_MID_Y_OFFSET = 22
/** Left edge of the db cylinder body (DB_BODY_D), at mid-height. */
const DB_ANCHOR_X_OFFSET = 12
const DB_ANCHOR_Y_OFFSET = 50

const sourceAnchor = (node: EdgeAnchorNode): { x: number; y: number } => ({
  x: node.x + node.width,
  y: node.y + BOX_MID_Y_OFFSET
})

const targetAnchor = (node: EdgeAnchorNode): { x: number; y: number } =>
  node.kind === 'database'
    ? { x: node.x + DB_ANCHOR_X_OFFSET, y: node.y + DB_ANCHOR_Y_OFFSET }
    : { x: node.x, y: node.y + BOX_MID_Y_OFFSET }

const buildEdgeLine = (
  doc: Document,
  edge: SystemGraphEdgeView,
  pointById: ReadonlyMap<string, EdgeAnchorNode>
): SVGElement | null => {
  const fromNode = pointById.get(edge.from)
  const toNode = pointById.get(edge.to)
  if (!fromNode || !toNode) return null
  const from = sourceAnchor(fromNode)
  const to = targetAnchor(toNode)
  const line = svgEl(doc, 'line')
  line.setAttribute('class', edge.cssClass)
  line.setAttribute('x1', String(from.x))
  line.setAttribute('y1', String(from.y))
  line.setAttribute('x2', String(to.x))
  line.setAttribute('y2', String(to.y))
  return line
}

export type SystemGraphHandle = {
  readonly element: SVGSVGElement
  apply(model: SystemGraphViewModel): void
  dispose(): void
}

/**
 * Renders systemGraphViewModel output as SVG — a <g> per node (a <rect>, or a cylinder
 * path+ellipse for database) plus label/method/diff/note text, and a <line> per edge between
 * node positions. Mirrors command-palette-element.ts: injectable doc, cssClass passthrough
 * only — no color literals here, all styling lives in index.html via the model's cssClass.
 */
export function createSystemGraph(doc: Document = document): SystemGraphHandle {
  const root = svgEl(doc, 'svg') as unknown as SVGSVGElement
  root.setAttribute('class', 'cubito-system-graph')

  const edgesLayer = svgEl(doc, 'g')
  edgesLayer.setAttribute('class', 'cubito-system-graph__edges')
  const nodesLayer = svgEl(doc, 'g')
  nodesLayer.setAttribute('class', 'cubito-system-graph__nodes')

  root.appendChild(edgesLayer)
  root.appendChild(nodesLayer)

  return {
    element: root,
    apply(model: SystemGraphViewModel) {
      const pointById = new Map(
        model.nodes.map((node) => [
          node.id,
          { x: node.x, y: node.y, width: node.width, height: node.height, kind: node.kind }
        ])
      )

      edgesLayer.replaceChildren()
      for (const edge of model.edges) {
        const line = buildEdgeLine(doc, edge, pointById)
        if (line) edgesLayer.appendChild(line)
      }

      nodesLayer.replaceChildren()
      for (const node of model.nodes) {
        nodesLayer.appendChild(buildNodeGroup(doc, node))
      }
    },
    dispose() {
      root.remove()
    }
  }
}
