import * as THREE from 'three'
import { describe, expect, it, vi } from 'vitest'
import type { NodeLabelModel } from '../hud/node-label-model'
import type { NodeVisual } from '../theme/node-visual'
import type { Elevation } from '../theme/node-elevation'
import { createNodeBinding } from './node-mesh'
import { createSceneResources } from './scene-resources'

const emptyLabel: NodeLabelModel = {
  primary: { text: 'main', tone: 'primary' },
  secondary: null,
  callout: null
}

const groundOrigin = { x: 0, y: 0, z: 0 }

const solidVisual: NodeVisual = {
  surface: { kind: 'solid', faces: { top: 0x111111, left: 0x222222, right: 0x333333 } },
  glow: { color: 0x111111, intensity: 0.85 },
  pulse: false,
  ring: null,
  dot: null
}

const archivedVisual: NodeVisual = {
  surface: { kind: 'wireframe', stroke: 0x3d4b57, dash: [4, 3], opacity: 0.5 },
  glow: null,
  pulse: false,
  ring: null,
  dot: null
}

// engine-blocked: no production path populates spawn yet, fixture only (mirrors node-visual.test.ts).
const spawningVisual: NodeVisual = {
  surface: { kind: 'wireframe', stroke: 0x2ea8ff, dash: [5, 4], opacity: 0.8 },
  glow: null,
  pulse: false,
  ring: null,
  dot: null
}

const withShadow: Elevation = { height: 0.52, shadow: { radius: 1.28, opacity: 0.44 } }
const noShadow: Elevation = { height: 0, shadow: null }

describe('createNodeBinding', () => {
  it('renders a solid surface with per-face colors matching the visual', () => {
    const resources = createSceneResources()
    const binding = createNodeBinding(resources)

    binding.apply({ visual: solidVisual, elevation: withShadow, ground: groundOrigin, label: emptyLabel, shadowColor: 0x000000 })

    const surface = binding.object.getObjectByName('surface') as THREE.Mesh
    expect(surface).toBeInstanceOf(THREE.Mesh)
    const materials = surface.material as THREE.MeshBasicMaterial[]
    expect(materials[0]?.color.getHex()).toBe(solidVisual.surface.kind === 'solid' ? solidVisual.surface.faces.right : -1)
    expect(materials[2]?.color.getHex()).toBe(solidVisual.surface.kind === 'solid' ? solidVisual.surface.faces.top : -1)
    expect(materials[4]?.color.getHex()).toBe(solidVisual.surface.kind === 'solid' ? solidVisual.surface.faces.left : -1)
  })

  it('renders a wireframe surface (archived) with matching stroke, dash and opacity', () => {
    const resources = createSceneResources()
    const binding = createNodeBinding(resources)

    binding.apply({ visual: archivedVisual, elevation: noShadow, ground: groundOrigin, label: emptyLabel, shadowColor: 0x000000 })

    const surface = binding.object.getObjectByName('surface') as THREE.LineSegments
    expect(surface).toBeInstanceOf(THREE.LineSegments)
    const material = surface.material as THREE.LineDashedMaterial
    expect(material.color.getHex()).toBe(archivedVisual.surface.kind === 'wireframe' ? archivedVisual.surface.stroke : -1)
    expect(material.dashSize).toBe(4)
    expect(material.gapSize).toBe(3)
    expect(material.opacity).toBe(0.5)
  })

  // engine-blocked: no production path populates spawn yet, fixture only.
  it('renders a wireframe surface for the synthetic spawning fixture', () => {
    const resources = createSceneResources()
    const binding = createNodeBinding(resources)

    binding.apply({ visual: spawningVisual, elevation: noShadow, ground: groundOrigin, label: emptyLabel, shadowColor: 0x000000 })

    const surface = binding.object.getObjectByName('surface') as THREE.LineSegments
    const material = surface.material as THREE.LineDashedMaterial
    expect(material.color.getHex()).toBe(0x2ea8ff)
    expect(material.dashSize).toBe(5)
    expect(material.gapSize).toBe(4)
    expect(material.opacity).toBe(0.8)
  })

  it('has no shadow-disc child when elevation.shadow is null', () => {
    const resources = createSceneResources()
    const binding = createNodeBinding(resources)

    binding.apply({ visual: archivedVisual, elevation: noShadow, ground: groundOrigin, label: emptyLabel, shadowColor: 0x000000 })

    const shadow = binding.object.getObjectByName('shadow') as THREE.Mesh | null
    expect(shadow === null || shadow.visible === false).toBe(true)
  })

  it('shows a shadow-disc child with opacity derived from elevation.shadow.opacity when non-null', () => {
    const resources = createSceneResources()
    const binding = createNodeBinding(resources)

    binding.apply({ visual: solidVisual, elevation: withShadow, ground: groundOrigin, label: emptyLabel, shadowColor: 0x000000 })

    const shadow = binding.object.getObjectByName('shadow') as THREE.Mesh
    expect(shadow).toBeInstanceOf(THREE.Mesh)
    expect(shadow.visible).toBe(true)
    const material = shadow.material as THREE.MeshBasicMaterial
    expect(material.opacity).toBe(withShadow.shadow?.opacity)
  })

  it('disposes every per-node material via the dispose event, and never touches shared geometry', () => {
    const resources = createSceneResources()
    const binding = createNodeBinding(resources)
    binding.apply({ visual: solidVisual, elevation: withShadow, ground: groundOrigin, label: emptyLabel, shadowColor: 0x000000 })

    const materials: THREE.Material[] = []
    binding.object.traverse((child) => {
      const withMaterial = child as unknown as { material?: THREE.Material | THREE.Material[] }
      if (!withMaterial.material) return
      const list = Array.isArray(withMaterial.material) ? withMaterial.material : [withMaterial.material]
      materials.push(...list)
    })
    expect(materials.length).toBeGreaterThan(0)
    const spies = materials.map((material) => {
      const spy = vi.fn()
      material.addEventListener('dispose', spy)
      return spy
    })
    const cubeGeometrySpy = vi.spyOn(resources.cubeGeometry, 'dispose')

    binding.dispose()

    for (const spy of spies) {
      expect(spy).toHaveBeenCalledTimes(1)
    }
    expect(cubeGeometrySpy).not.toHaveBeenCalled()
  })

  it('tick() never throws for pulsing or non-pulsing visuals', () => {
    const resources = createSceneResources()
    const binding = createNodeBinding(resources)
    binding.apply({
      visual: { ...solidVisual, pulse: true, dot: { color: 0x9fef00, pulse: true } },
      elevation: withShadow,
      ground: groundOrigin,
      label: emptyLabel,
      shadowColor: 0x000000
    })

    expect(() => binding.tick(0.4)).not.toThrow()
  })
})
