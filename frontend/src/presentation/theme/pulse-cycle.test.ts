import { describe, expect, it } from 'vitest'
import { pulseOpacity } from './pulse-cycle'

describe('pulseOpacity', () => {
  it('starts at max opacity', () => {
    expect(pulseOpacity(0)).toBeCloseTo(1, 9)
  })

  it('reaches min opacity at the half-period', () => {
    expect(pulseOpacity(0.8)).toBeCloseTo(0.4, 9)
  })

  it('returns to max opacity at a full period', () => {
    expect(pulseOpacity(1.6)).toBeCloseTo(1, 9)
  })

  it('is symmetric about the half-period (ease-in-out mirrors both halves)', () => {
    for (const x of [0.1, 0.2, 0.35, 0.5, 0.7, 0.79]) {
      expect(pulseOpacity(0.8 - x)).toBeCloseTo(pulseOpacity(0.8 + x), 6)
    }
  })

  it('repeats every period, matching phase-equivalent elapsed values', () => {
    for (const elapsed of [0.1, 0.4, 0.8, 1.2, 1.5]) {
      expect(pulseOpacity(elapsed)).toBeCloseTo(pulseOpacity(elapsed + 1.6), 6)
    }
  })

  it('clamps to max opacity when reduced motion is requested, regardless of elapsed time', () => {
    for (const elapsed of [0, 0.3, 0.8, 1.1, 1.6, 42]) {
      expect(pulseOpacity(elapsed, { reducedMotion: true })).toBe(1)
    }
  })
})
