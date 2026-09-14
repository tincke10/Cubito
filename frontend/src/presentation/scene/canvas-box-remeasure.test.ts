import { describe, expect, it } from 'vitest'
import { needsRemeasure } from './canvas-box-remeasure'
import type { CanvasBox } from './canvas-box-remeasure'

const box = (hidden: boolean, narrowed: boolean): CanvasBox => ({ hidden, narrowed })

describe('needsRemeasure', () => {
  it('a scene-replacing mode closing needs a remeasure (the old didSceneModeClose case)', () => {
    expect(needsRemeasure(box(true, false), box(false, false))).toBe(true)
  })

  it('the side panel opening needs a remeasure', () => {
    expect(needsRemeasure(box(false, false), box(false, true))).toBe(true)
  })

  it('the side panel closing needs a remeasure', () => {
    expect(needsRemeasure(box(false, true), box(false, false))).toBe(true)
  })

  it('a scene-replacing mode opening does not — the canvas is hidden and measures 0x0', () => {
    expect(needsRemeasure(box(false, false), box(true, false))).toBe(false)
  })

  it('no change needs no remeasure', () => {
    expect(needsRemeasure(box(false, false), box(false, false))).toBe(false)
    expect(needsRemeasure(box(true, false), box(true, false))).toBe(false)
  })

  it('becoming visible AND narrowed in one step needs one remeasure', () => {
    expect(needsRemeasure(box(true, false), box(false, true))).toBe(true)
  })
})
