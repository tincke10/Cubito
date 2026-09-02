import * as THREE from 'three'
import { describe, expect, it, vi } from 'vitest'
import { createGlowSprite } from './glow-sprite'
import { createSceneResources } from './scene-resources'

describe('createGlowSprite', () => {
  it('is a persistent Sprite using the shared additive glow DataTexture', () => {
    const resources = createSceneResources()
    const glow = createGlowSprite(resources)

    expect(glow.object).toBeInstanceOf(THREE.Sprite)
    const material = glow.object.material as THREE.SpriteMaterial
    expect(material.map).toBe(resources.glowTexture)
    expect(material.blending).toBe(THREE.AdditiveBlending)
  })

  it('hides the sprite when apply(null) is called', () => {
    const resources = createSceneResources()
    const glow = createGlowSprite(resources)

    glow.apply(null)

    expect(glow.object.visible).toBe(false)
  })

  it('shows the sprite tinted by color, opacity derived from intensity, when apply(non-null) is called', () => {
    const resources = createSceneResources()
    const glow = createGlowSprite(resources)

    glow.apply({ color: 0xb7ff33, intensity: 0.85 })

    expect(glow.object.visible).toBe(true)
    const material = glow.object.material as THREE.SpriteMaterial
    expect(material.color.getHex()).toBe(0xb7ff33)
    expect(material.opacity).toBe(0.85)
  })

  it('dispose() disposes its own material but never the shared glow texture', () => {
    const resources = createSceneResources()
    const glow = createGlowSprite(resources)
    const textureSpy = vi.spyOn(resources.glowTexture, 'dispose')
    const material = glow.object.material as THREE.SpriteMaterial
    const materialSpy = vi.spyOn(material, 'dispose')

    glow.dispose()

    expect(materialSpy).toHaveBeenCalledTimes(1)
    expect(textureSpy).not.toHaveBeenCalled()
  })
})
