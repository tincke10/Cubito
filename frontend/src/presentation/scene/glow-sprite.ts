import * as THREE from 'three'
import { GLOW_SPRITE_SCALE } from '../theme/scene-metrics'
import type { SceneResources } from './scene-resources'

export type GlowSpriteInput = { color: number; intensity: number } | null

export type GlowSpriteBinding = {
  object: THREE.Sprite
  apply(input: GlowSpriteInput): void
  dispose(): void
}

/** Persistent additive sprite tinted per-node via `material.color`, using the shared Gaussian
 *  `DataTexture` from `SceneResources` — keeps the falloff testable without a canvas (design §5.2). */
export const createGlowSprite = (resources: SceneResources): GlowSpriteBinding => {
  const material = new THREE.SpriteMaterial({
    map: resources.glowTexture,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false
  })
  const object = new THREE.Sprite(material)
  object.scale.setScalar(GLOW_SPRITE_SCALE)
  object.visible = false

  return {
    object,
    apply(input: GlowSpriteInput): void {
      if (input === null) {
        object.visible = false
        return
      }
      object.visible = true
      material.color.setHex(input.color)
      material.opacity = input.intensity
    },
    dispose(): void {
      material.dispose()
    }
  }
}
