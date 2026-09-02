import { describe, expect, it } from 'vitest'
import { darkPalette, lightPalette, paletteFor } from './scene-palette'
import type { ScenePalette } from './scene-palette'

const faceTriadKeys = ['top', 'left', 'right'] as const

describe('scene-palette', () => {
  it('populates every field on both palettes', () => {
    for (const palette of [darkPalette, lightPalette]) {
      for (const [key, value] of Object.entries(palette)) {
        if (typeof value === 'object' && value !== null) {
          for (const triadKey of faceTriadKeys) {
            expect(
              (value as Record<string, unknown>)[triadKey],
              `${key}.${triadKey}`
            ).not.toBeUndefined()
          }
        } else {
          expect(value, key).not.toBeUndefined()
        }
      }
    }
  })

  it('matches the dark palette hexes verbatim from the mockups', () => {
    const expected: ScenePalette = {
      background: 0x0a0e12,
      vignetteEdge: 0x05080b,
      gridLine: 0x10231a,
      rootFaces: { top: 0xb7ff33, left: 0x567f00, right: 0x85c400 },
      activeFaces: { top: 0x7ecbff, left: 0x17557f, right: 0x2ea8ff },
      waitingFaces: { top: 0xffcb52, left: 0x8f5c00, right: 0xe8a200 },
      idleFaces: { top: 0x3d4b57, left: 0x1d262e, right: 0x2c3945 },
      archivedStroke: 0x3d4b57,
      spawningStroke: 0x2ea8ff,
      edgeNormal: 0x3a5f3a,
      edgeFlow: 0x2ea8ff,
      edgeFaint: 0x3a5f3a,
      accent: 0x9fef00,
      accentBright: 0xb7ff33,
      amber: 0xffb000,
      amberDim: 0xb58200,
      amberInk: 0xe8a200,
      info: 0x2ea8ff,
      textPrimary: 0xc8d3da,
      textDim: 0x6b7a85,
      textFaint: 0x4a5a64,
      keyChip: 0x8fa3ad,
      panelSurface: 0x0d1319,
      panelBorder: 0x1b2833,
      shadow: 0x000000
    }
    expect(darkPalette).toEqual(expected)
  })

  it('resolves paletteFor by theme, by reference', () => {
    expect(paletteFor('dark')).toBe(darkPalette)
    expect(paletteFor('light')).toBe(lightPalette)
  })
})
