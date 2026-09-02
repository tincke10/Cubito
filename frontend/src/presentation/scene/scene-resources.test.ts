import * as THREE from 'three'
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js'
import { describe, expect, it, vi } from 'vitest'
import { createSceneResources } from './scene-resources'

describe('createSceneResources', () => {
  it('creates each shared geometry and texture exactly once', () => {
    const resources = createSceneResources()

    expect(resources.cubeGeometry).toBeInstanceOf(THREE.BoxGeometry)
    expect(resources.wireGeometry).toBeInstanceOf(THREE.EdgesGeometry)
    expect(resources.shadowGeometry).toBeInstanceOf(THREE.CircleGeometry)
    expect(resources.ringGeometry).toBeInstanceOf(LineSegmentsGeometry)
    expect(resources.glowTexture).toBeInstanceOf(THREE.DataTexture)
    expect(resources.dotTexture).toBeInstanceOf(THREE.DataTexture)
    expect(resources.glowTexture).not.toBe(resources.dotTexture)
  })

  it('dispose() calls .dispose() on every owned resource exactly once', () => {
    const resources = createSceneResources()
    const owned = [
      resources.cubeGeometry,
      resources.wireGeometry,
      resources.shadowGeometry,
      resources.ringGeometry,
      resources.glowTexture,
      resources.dotTexture
    ]
    const spies = owned.map((resource) => vi.spyOn(resource, 'dispose'))

    resources.dispose()

    for (const spy of spies) {
      expect(spy).toHaveBeenCalledTimes(1)
    }
  })
})
