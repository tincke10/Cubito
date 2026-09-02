import { describe, expect, it } from 'vitest'
import { cssVarsFor } from './css-theme'
import { darkPalette } from './scene-palette'

describe('cssVarsFor', () => {
  it('emits a --cubito-<kebab-token> hex string for every top-level color', () => {
    const vars = cssVarsFor(darkPalette)
    expect(vars['--cubito-accent']).toBe('#9fef00')
    expect(vars['--cubito-background']).toBe('#0a0e12')
    expect(vars['--cubito-vignette-edge']).toBe('#05080b')
    expect(vars['--cubito-edge-flow']).toBe('#2ea8ff')
  })

  it('flattens nested FaceTriad tokens as <group>-<face>', () => {
    const vars = cssVarsFor(darkPalette)
    expect(vars['--cubito-root-faces-top']).toBe('#b7ff33')
    expect(vars['--cubito-root-faces-left']).toBe('#567f00')
    expect(vars['--cubito-root-faces-right']).toBe('#85c400')
    expect(vars['--cubito-waiting-faces-top']).toBe('#ffcb52')
  })

  it('derives every hex from the numeric palette via toString(16)/padStart, never drifting', () => {
    const vars = cssVarsFor(darkPalette)
    expect(vars['--cubito-accent']).toBe('#' + darkPalette.accent.toString(16).padStart(6, '0'))
  })

  it('covers every ScenePalette field with no gaps', () => {
    const vars = cssVarsFor(darkPalette)
    // 22 flat number fields + 4 triads × 3 faces = 34 total keys
    const flatCount = Object.entries(darkPalette).filter(([, v]) => typeof v === 'number').length
    const triadCount = Object.entries(darkPalette).filter(([, v]) => typeof v === 'object').length
    expect(Object.keys(vars)).toHaveLength(flatCount + triadCount * 3)
    for (const value of Object.values(vars)) {
      expect(value).toMatch(/^#[0-9a-f]{6}$/)
    }
  })
})
