import type { NodeLabelModel } from './node-label-model'

/** Mockup drop below the ground shadow (index.html node-label offset, design D1). */
export const LABEL_OFFSET_Y_PX = 26
/** Monospace advance for 'Fira Code'/SF Mono/Cascadia at 11px (index.html font-size). */
export const LABEL_CHAR_ADVANCE_PX = 6.6
/** 11px × 1.45 line-height (index.html .cubito-node-label). */
export const LABEL_LINE_HEIGHT_PX = 15.95
/** Dead band, both directions — kills flicker at a collision boundary with no timers. */
export const LABEL_COLLISION_HYSTERESIS_PX = 4

export type LabelBox = { readonly width: number; readonly height: number }
export type LabelRect = {
  readonly left: number
  readonly top: number
  readonly right: number
  readonly bottom: number
}
export type ScreenAnchor = { readonly x: number; readonly y: number; readonly visible: boolean }
/** Declared here, not imported from terminal-connector-projector — scene/ may not import that module. */
export type LabelAnchorProjection = (ground: {
  readonly x: number
  readonly y: number
  readonly z: number
}) => ScreenAnchor

export type LabelCandidate = {
  readonly id: string
  readonly rect: LabelRect
  readonly priority: number
}

const linesOf = (model: NodeLabelModel): readonly string[] => {
  const lines = [model.primary.text]
  if (model.secondary !== null) lines.push(model.secondary.text)
  if (model.callout !== null) lines.push(model.callout.title.text, model.callout.hint.text)
  return lines
}

/** Box from the text alone — monospace, so no getBoundingClientRect and no forced reflow. */
export function labelBoxPx(model: NodeLabelModel): LabelBox {
  const lines = linesOf(model)
  const widestChars = Math.max(...lines.map((line) => line.length))
  return {
    width: widestChars * LABEL_CHAR_ADVANCE_PX,
    height: lines.length * LABEL_LINE_HEIGHT_PX
  }
}

/** Centred on the projected ground point, dropped LABEL_OFFSET_Y_PX below it. */
export function labelRectAt(anchor: ScreenAnchor, box: LabelBox): LabelRect {
  const left = anchor.x - box.width / 2
  const top = anchor.y + LABEL_OFFSET_Y_PX
  return { left, top, right: left + box.width, bottom: top + box.height }
}

const pad = (rect: LabelRect, amount: number): LabelRect => ({
  left: rect.left - amount,
  top: rect.top - amount,
  right: rect.right + amount,
  bottom: rect.bottom + amount
})

const intersects = (a: LabelRect, b: LabelRect): boolean =>
  a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top

const byPriorityThenId = (a: LabelCandidate, b: LabelCandidate): number =>
  b.priority - a.priority || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)

/**
 * Greedy priority hiding (design D3). Stable order — priority desc, then id asc — so the
 * result never depends on Map insertion order, which reconciliation can reorder frame to frame.
 * Hysteresis is asymmetric per candidate: a currently-hidden one is padded OUT (needs real
 * clearance to return), a currently-visible one is padded IN (needs real overlap to vanish).
 */
export function resolveLabelCollisions(
  candidates: readonly LabelCandidate[],
  hidden: ReadonlySet<string>
): Set<string> {
  const accepted: LabelRect[] = []
  const nextHidden = new Set<string>()
  for (const candidate of [...candidates].sort(byPriorityThenId)) {
    const amount = hidden.has(candidate.id)
      ? LABEL_COLLISION_HYSTERESIS_PX
      : -LABEL_COLLISION_HYSTERESIS_PX
    const padded = pad(candidate.rect, amount)
    if (accepted.some((rect) => intersects(padded, rect))) {
      nextHidden.add(candidate.id)
    } else {
      accepted.push(candidate.rect)
    }
  }
  return nextHidden
}
