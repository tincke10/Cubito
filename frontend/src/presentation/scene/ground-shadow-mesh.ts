import * as THREE from 'three'
import type { SceneResources } from './scene-resources'

/** `Elevation.shadow` (B7) plus the theme-dependent disc color (`ScenePalette.shadow`) —
 *  color is threaded in by the caller since it isn't part of the domain `Elevation` type. */
export type GroundShadowInput = { radius: number; opacity: number; color: number } | null

export type GroundShadowBinding = {
  object: THREE.Mesh
  apply(input: GroundShadowInput): void
  dispose(): void
}

/** Persistent ground disc reusing the shared unit-radius `CircleGeometry`; `apply(null)` hides
 *  it (archived's shadowless state) rather than removing it from the scene graph. */
export const createGroundShadowMesh = (resources: SceneResources): GroundShadowBinding => {
  const material = new THREE.MeshBasicMaterial({ transparent: true })
  const object = new THREE.Mesh(resources.shadowGeometry, material)
  object.rotation.x = -Math.PI / 2
  object.visible = false

  return {
    object,
    apply(input: GroundShadowInput): void {
      if (input === null) {
        object.visible = false
        return
      }
      object.visible = true
      object.scale.setScalar(input.radius)
      material.opacity = input.opacity
      material.color.setHex(input.color)
    },
    dispose(): void {
      material.dispose()
    }
  }
}
