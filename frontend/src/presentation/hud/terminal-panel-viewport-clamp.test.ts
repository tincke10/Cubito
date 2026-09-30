import { describe, expect, it } from 'vitest'
import { clampPanelToViewport } from './terminal-panel-viewport-clamp'

const size = { width: 520, height: 360 }
const viewport = { width: 1200, height: 800 }

describe('clampPanelToViewport', () => {
  it('leaves a panel that already fits untouched', () => {
    expect(clampPanelToViewport({ x: 600, y: 400 }, size, viewport, 12)).toEqual({ x: 600, y: 400 })
  })

  it('pulls a panel overflowing the left edge back inside by the margin', () => {
    expect(clampPanelToViewport({ x: 100, y: 400 }, size, viewport, 12).x).toBe(260 + 12)
  })

  it('pulls a panel overflowing the right edge back inside by the margin', () => {
    expect(clampPanelToViewport({ x: 1190, y: 400 }, size, viewport, 12).x).toBe(1200 - 260 - 12)
  })

  it('clamps the vertical axis at top and bottom', () => {
    expect(clampPanelToViewport({ x: 600, y: -500 }, size, viewport, 12).y).toBe(180 + 12)
    expect(clampPanelToViewport({ x: 600, y: 2000 }, size, viewport, 12).y).toBe(800 - 180 - 12)
  })

  it('centers on an axis where the panel cannot fit at all', () => {
    expect(clampPanelToViewport({ x: 0, y: 0 }, size, { width: 400, height: 300 }, 12)).toEqual({
      x: 200,
      y: 150
    })
  })
})
