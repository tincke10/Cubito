import { describe, expect, it } from 'vitest'
import { radialAlphaTexels } from './glow-falloff'

const SIZE = 15 // odd — gives an exact single center texel
const SIGMA = 4
const CENTER = (SIZE - 1) / 2

const texelAt = (texels: Uint8Array, x: number, y: number): number => {
  const value = texels[y * SIZE + x]
  if (value === undefined) throw new Error(`texel (${x},${y}) out of range`)
  return value
}

describe('radialAlphaTexels', () => {
  it('returns a texel field of size*size', () => {
    const texels = radialAlphaTexels(SIZE, SIGMA)
    expect(texels).toBeInstanceOf(Uint8Array)
    expect(texels.length).toBe(SIZE * SIZE)
  })

  it('is brightest at the center', () => {
    const texels = radialAlphaTexels(SIZE, SIGMA)
    expect(texelAt(texels, CENTER, CENTER)).toBe(255)
  })

  it('strictly decreases with radial distance from the center', () => {
    const texels = radialAlphaTexels(SIZE, SIGMA)
    const alongAxis = []
    for (let x = CENTER; x < SIZE; x += 1) alongAxis.push(texelAt(texels, x, CENTER))
    for (let i = 1; i < alongAxis.length; i += 1) {
      expect(alongAxis[i]).toBeLessThan(alongAxis[i - 1] as number)
    }
  })

  it('is symmetric about the center', () => {
    const texels = radialAlphaTexels(SIZE, SIGMA)
    for (let dy = -CENTER; dy <= CENTER; dy += 1) {
      for (let dx = -CENTER; dx <= CENTER; dx += 1) {
        expect(texelAt(texels, CENTER + dx, CENTER + dy)).toBe(texelAt(texels, CENTER - dx, CENTER - dy))
      }
    }
  })
})
