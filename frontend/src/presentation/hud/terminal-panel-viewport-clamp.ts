export type PanelBox = { width: number; height: number }
export type ScreenXY = { x: number; y: number }

const clampAxis = (center: number, panel: number, viewport: number, margin: number): number => {
  const min = panel / 2 + margin
  const max = viewport - panel / 2 - margin
  // Why: a panel wider than the viewport can't satisfy both edges — center it.
  if (min > max) return viewport / 2
  return Math.min(Math.max(center, min), max)
}

/** Screen-space center that keeps a panel of `panel` size fully inside `viewport` (with `margin`). */
export function clampPanelToViewport(
  center: ScreenXY,
  panel: PanelBox,
  viewport: PanelBox,
  margin: number
): ScreenXY {
  return {
    x: clampAxis(center.x, panel.width, viewport.width, margin),
    y: clampAxis(center.y, panel.height, viewport.height, margin)
  }
}
