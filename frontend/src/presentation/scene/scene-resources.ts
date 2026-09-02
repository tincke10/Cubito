import * as THREE from 'three'
import { radialAlphaTexels } from '../theme/glow-falloff'
import { NODE_HEIGHT, NODE_SIZE } from '../theme/scene-metrics'

// Texture/tessellation resolution — implementation detail of *this* shared-resource factory,
// not a mockup-measured value, so it stays local rather than in theme/scene-metrics.ts.
const GLOW_TEXTURE_SIZE = 64
const GLOW_TEXTURE_SIGMA_TEXELS = 16
const DOT_TEXTURE_SIZE = 32
const DOT_TEXTURE_SIGMA_TEXELS = 6
const SHADOW_DISC_SEGMENTS = 32
const RING_SEGMENTS = 48

export type SceneResources = {
  readonly cubeGeometry: THREE.BoxGeometry
  readonly wireGeometry: THREE.EdgesGeometry
  readonly shadowGeometry: THREE.CircleGeometry
  readonly ringGeometry: THREE.BufferGeometry
  readonly glowTexture: THREE.DataTexture
  readonly dotTexture: THREE.DataTexture
  dispose(): void
}

const alphaTexture = (size: number, sigmaTexels: number): THREE.DataTexture => {
  // WebGL2 texStorage2D rejects unsized AlphaFormat: expand to white RGBA
  const alpha = radialAlphaTexels(size, sigmaTexels)
  const rgba = new Uint8Array(alpha.length * 4)
  for (let i = 0; i < alpha.length; i += 1) {
    rgba[i * 4] = 255
    rgba[i * 4 + 1] = 255
    rgba[i * 4 + 2] = 255
    rgba[i * 4 + 3] = alpha[i] ?? 0
  }
  const texture = new THREE.DataTexture(rgba, size, size, THREE.RGBAFormat)
  texture.needsUpdate = true
  return texture
}

/** Unit-radius ground ring as XZ-plane segment pairs; `LineSegmentsGeometry` would need `LineSegments2` to render. */
const unitRingPositions = (segments: number): Float32Array => {
  const positions = new Float32Array(segments * 2 * 3)
  const twoPi = Math.PI * 2
  for (let i = 0; i < segments; i += 1) {
    const a0 = (i / segments) * twoPi
    const a1 = ((i + 1) / segments) * twoPi
    const offset = i * 6
    positions[offset] = Math.cos(a0)
    positions[offset + 1] = 0
    positions[offset + 2] = Math.sin(a0)
    positions[offset + 3] = Math.cos(a1)
    positions[offset + 4] = 0
    positions[offset + 5] = Math.sin(a1)
  }
  return positions
}

/** Shared, immutable resources created once per `GraphView` (design §5.4/§6): geometry and
 *  textures are reused by every node/edge binding; only per-node materials are owned by them. */
export const createSceneResources = (): SceneResources => {
  const cubeGeometry = new THREE.BoxGeometry(NODE_SIZE, NODE_HEIGHT, NODE_SIZE)
  const wireGeometry = new THREE.EdgesGeometry(cubeGeometry)
  const shadowGeometry = new THREE.CircleGeometry(1, SHADOW_DISC_SEGMENTS)
  const ringGeometry = new THREE.BufferGeometry()
  ringGeometry.setAttribute('position', new THREE.BufferAttribute(unitRingPositions(RING_SEGMENTS), 3))
  const glowTexture = alphaTexture(GLOW_TEXTURE_SIZE, GLOW_TEXTURE_SIGMA_TEXELS)
  const dotTexture = alphaTexture(DOT_TEXTURE_SIZE, DOT_TEXTURE_SIGMA_TEXELS)

  return {
    cubeGeometry,
    wireGeometry,
    shadowGeometry,
    ringGeometry,
    glowTexture,
    dotTexture,
    dispose(): void {
      cubeGeometry.dispose()
      wireGeometry.dispose()
      shadowGeometry.dispose()
      ringGeometry.dispose()
      glowTexture.dispose()
      dotTexture.dispose()
    }
  }
}
