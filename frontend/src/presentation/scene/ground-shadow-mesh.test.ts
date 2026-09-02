import * as THREE from 'three'
import { describe, expect, it, vi } from 'vitest'
import { createGroundShadowMesh } from './ground-shadow-mesh'
import { createSceneResources } from './scene-resources'

describe('createGroundShadowMesh', () => {
  it('is a persistent Mesh reusing the shared shadow geometry', () => {
    const resources = createSceneResources()
    const shadow = createGroundShadowMesh(resources)

    expect(shadow.object).toBeInstanceOf(THREE.Mesh)
    expect(shadow.object.geometry).toBe(resources.shadowGeometry)
  })

  it('hides the mesh when apply(null) is called', () => {
    const resources = createSceneResources()
    const shadow = createGroundShadowMesh(resources)

    shadow.apply(null)

    expect(shadow.object.visible).toBe(false)
  })

  it('shows the mesh with radius/opacity/color matching input when apply(non-null) is called', () => {
    const resources = createSceneResources()
    const shadow = createGroundShadowMesh(resources)

    shadow.apply({ radius: 1.28, opacity: 0.44, color: 0x000000 })

    expect(shadow.object.visible).toBe(true)
    expect(shadow.object.scale.x).toBeCloseTo(1.28)
    expect(shadow.object.scale.z).toBeCloseTo(1.28)
    const material = shadow.object.material as THREE.MeshBasicMaterial
    expect(material.opacity).toBe(0.44)
    expect(material.color.getHex()).toBe(0x000000)
  })

  it('dispose() disposes its own material but never the shared shadow geometry', () => {
    const resources = createSceneResources()
    const shadow = createGroundShadowMesh(resources)
    const geometrySpy = vi.spyOn(resources.shadowGeometry, 'dispose')
    const material = shadow.object.material as THREE.MeshBasicMaterial
    const materialSpy = vi.spyOn(material, 'dispose')

    shadow.dispose()

    expect(materialSpy).toHaveBeenCalledTimes(1)
    expect(geometrySpy).not.toHaveBeenCalled()
  })
})
