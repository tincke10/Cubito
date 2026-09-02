import * as THREE from 'three'
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js'
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js'
import { describe, expect, it } from 'vitest'
import type { EdgeVisual } from '../theme/edge-visual'
import { flowDashOffset } from '../theme/edge-visual'
import { createEdgeBinding } from './edge-line'

const from = { x: 0, y: 0.3, z: 0 }
const to = { x: 3, y: 0.6, z: 1 }

const flowVisual: EdgeVisual = {
  color: 0x2ea8ff,
  opacity: 0.5,
  width: 1.5,
  dash: { size: 0.1248, gap: 0.1248 },
  flowing: true
}

const solidVisual: EdgeVisual = {
  color: 0x3a5f3a,
  opacity: 0.8,
  width: 1.5,
  dash: null,
  flowing: false
}

describe('createEdgeBinding', () => {
  it('builds a dashed LineMaterial when visual.dash is non-null, matching color/opacity/linewidth', () => {
    const binding = createEdgeBinding()
    binding.apply({ visual: flowVisual, from, to })

    expect(binding.object).toBeInstanceOf(LineSegments2)
    const material = binding.object.material as LineMaterial
    expect(material.dashed).toBe(true)
    expect(material.color.getHex()).toBe(flowVisual.color)
    expect(material.opacity).toBe(flowVisual.opacity)
    expect(material.linewidth).toBe(flowVisual.width)
    expect(material.dashSize).toBe(flowVisual.dash?.size)
    expect(material.gapSize).toBe(flowVisual.dash?.gap)
  })

  it('builds a non-dashed LineMaterial when visual.dash is null', () => {
    const binding = createEdgeBinding()
    binding.apply({ visual: solidVisual, from, to })

    const material = binding.object.material as LineMaterial
    expect(material.dashed).toBe(false)
    expect(material.color.getHex()).toBe(solidVisual.color)
    expect(material.opacity).toBe(solidVisual.opacity)
    expect(material.linewidth).toBe(solidVisual.width)
  })

  it('advances dashOffset deterministically across two fixed-dt ticks, matching flowDashOffset', () => {
    const binding = createEdgeBinding()
    binding.apply({ visual: flowVisual, from, to })
    const material = binding.object.material as LineMaterial

    binding.tick(0.4)
    expect(material.dashOffset).toBeCloseTo(flowDashOffset(0.4), 10)

    binding.tick(0.9)
    expect(material.dashOffset).toBeCloseTo(flowDashOffset(0.9), 10)
  })

  it('exposes setResolution as a required, separately-callable method that updates LineMaterial.resolution', () => {
    const binding = createEdgeBinding()
    binding.apply({ visual: solidVisual, from, to })
    const material = binding.object.material as LineMaterial

    binding.setResolution(1024, 768)

    expect(material.resolution.x).toBe(1024)
    expect(material.resolution.y).toBe(768)
  })

  it('setResolution works independently of apply()/tick(), before or after either is called', () => {
    const binding = createEdgeBinding()
    const material = binding.object.material as LineMaterial

    binding.setResolution(800, 600)
    expect(material.resolution.x).toBe(800)
    expect(material.resolution.y).toBe(600)

    binding.apply({ visual: flowVisual, from, to })
    binding.tick(0.1)

    expect(material.resolution.x).toBe(800)
    expect(material.resolution.y).toBe(600)
  })

  it('dispose() disposes its own per-edge geometry and material', () => {
    const binding = createEdgeBinding()
    binding.apply({ visual: solidVisual, from, to })
    const material = binding.object.material as LineMaterial
    const geometry = binding.object.geometry

    let materialDisposed = false
    let geometryDisposed = false
    material.addEventListener('dispose', () => (materialDisposed = true))
    geometry.addEventListener('dispose', () => (geometryDisposed = true))

    binding.dispose()

    expect(materialDisposed).toBe(true)
    expect(geometryDisposed).toBe(true)
  })

  it('calls computeLineDistances() so dashed rendering has valid line distances after setPositions', () => {
    const binding = createEdgeBinding()
    binding.apply({ visual: flowVisual, from, to })

    const distanceAttribute = binding.object.geometry.attributes['instanceDistanceStart']
    expect(distanceAttribute).toBeDefined()
  })
})
