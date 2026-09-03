import { describe, expect, it } from 'vitest'
import { projectToScreen } from './terminal-connector-projector'

describe('projectToScreen', () => {
  it('maps NDC origin to the viewport center', () => {
    expect(projectToScreen({ x: 0, y: 0, z: 0 }, 1000, 800)).toEqual({
      x: 500,
      y: 400,
      visible: true
    })
  })

  it('maps NDC corners to pixel corners, flipping Y', () => {
    expect(projectToScreen({ x: -1, y: 1, z: 0 }, 1000, 800)).toEqual({ x: 0, y: 0, visible: true })
    expect(projectToScreen({ x: 1, y: -1, z: 0 }, 1000, 800)).toEqual({
      x: 1000,
      y: 800,
      visible: true
    })
  })

  it('is not visible when the point is behind the camera (NDC z outside [-1,1])', () => {
    expect(projectToScreen({ x: 0, y: 0, z: 1.5 }, 1000, 800).visible).toBe(false)
    expect(projectToScreen({ x: 0, y: 0, z: -1.5 }, 1000, 800).visible).toBe(false)
  })
})
