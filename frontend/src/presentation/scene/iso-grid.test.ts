import * as THREE from 'three'
import { describe, expect, it, vi } from 'vitest'
import { GRID_BASE_OPACITY, GRID_FADE_RADIUS, GRID_MIN_ALPHA } from '../theme/scene-metrics'
import { createIsoGrid, gridLineAlpha } from './iso-grid'

describe('gridLineAlpha', () => {
  it('is GRID_BASE_OPACITY at the center (distance 0)', () => {
    expect(gridLineAlpha(0)).toBeCloseTo(GRID_BASE_OPACITY)
  })

  it('clamps to GRID_BASE_OPACITY * GRID_MIN_ALPHA at and beyond GRID_FADE_RADIUS', () => {
    expect(gridLineAlpha(GRID_FADE_RADIUS)).toBeCloseTo(GRID_BASE_OPACITY * GRID_MIN_ALPHA)
    expect(gridLineAlpha(GRID_FADE_RADIUS * 2)).toBeCloseTo(GRID_BASE_OPACITY * GRID_MIN_ALPHA)
  })

  it('decreases monotonically with distance', () => {
    const a = gridLineAlpha(GRID_FADE_RADIUS * 0.25)
    const b = gridLineAlpha(GRID_FADE_RADIUS * 0.5)
    const c = gridLineAlpha(GRID_FADE_RADIUS * 0.75)
    expect(a).toBeGreaterThan(b)
    expect(b).toBeGreaterThan(c)
  })
})

describe('createIsoGrid', () => {
  it('builds a LineSegments grid with a per-vertex color attribute', () => {
    const grid = createIsoGrid()

    expect(grid.object).toBeInstanceOf(THREE.LineSegments)
    expect(grid.object.geometry.getAttribute('position')).toBeDefined()
    expect(grid.object.geometry.getAttribute('color')).toBeDefined()
  })

  it('every vertex color equals gridLineAlpha(distance from center), tinted by apply(color)', () => {
    const grid = createIsoGrid()
    grid.apply(0x10231a)

    const position = grid.object.geometry.getAttribute('position')
    const color = grid.object.geometry.getAttribute('color')
    expect(color.count).toBe(position.count)

    for (let i = 0; i < position.count; i += 1) {
      const x = position.getX(i)
      const z = position.getZ(i)
      const distance = Math.hypot(x, z)
      const expectedAlpha = gridLineAlpha(distance)
      expect(color.getX(i)).toBeCloseTo(expectedAlpha, 5)
      expect(color.getY(i)).toBeCloseTo(expectedAlpha, 5)
      expect(color.getZ(i)).toBeCloseTo(expectedAlpha, 5)
    }
  })

  it('dispose() disposes its own geometry and material', () => {
    const grid = createIsoGrid()
    const geometrySpy = vi.spyOn(grid.object.geometry, 'dispose')
    const materialSpy = vi.spyOn(grid.object.material as THREE.Material, 'dispose')

    grid.dispose()

    expect(geometrySpy).toHaveBeenCalledTimes(1)
    expect(materialSpy).toHaveBeenCalledTimes(1)
  })
})
