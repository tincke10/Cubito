import * as THREE from 'three'
import { GRID_BASE_OPACITY, GRID_CELL, GRID_FADE_RADIUS, GRID_HALF_EXTENT, GRID_MIN_ALPHA } from '../theme/scene-metrics'

const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), max)

/** Radial distance fade (design §7.6) — the mockup's screen-space vertical ramp becomes a
 *  camera-target-relative radial ramp so it stays correct under an orbitable camera. */
export const gridLineAlpha = (distance: number): number =>
  GRID_BASE_OPACITY * clamp(1 - distance / GRID_FADE_RADIUS, GRID_MIN_ALPHA, 1)

export type IsoGridBinding = {
  object: THREE.LineSegments
  apply(color: number): void
  dispose(): void
}

type GridArrays = { positions: Float32Array; colors: Float32Array }

const buildGridArrays = (): GridArrays => {
  const lineCount = GRID_HALF_EXTENT / GRID_CELL
  const positions: number[] = []

  for (let i = -lineCount; i <= lineCount; i += 1) {
    const offset = i * GRID_CELL
    // line parallel to X axis, at fixed z
    positions.push(-GRID_HALF_EXTENT, 0, offset, GRID_HALF_EXTENT, 0, offset)
    // line parallel to Z axis, at fixed x
    positions.push(offset, 0, -GRID_HALF_EXTENT, offset, 0, GRID_HALF_EXTENT)
  }

  const positionArray = new Float32Array(positions)
  const vertexCount = positionArray.length / 3
  const colors = new Float32Array(vertexCount * 3)
  for (let v = 0; v < vertexCount; v += 1) {
    const x = positionArray[v * 3] ?? 0
    const z = positionArray[v * 3 + 2] ?? 0
    const alpha = gridLineAlpha(Math.hypot(x, z))
    colors[v * 3] = alpha
    colors[v * 3 + 1] = alpha
    colors[v * 3 + 2] = alpha
  }

  return { positions: positionArray, colors }
}

/** Static ground grid (design §7.8's projection tile), one instance shared by the whole scene —
 *  vertex color encodes the radial fade since `LineBasicMaterial` has no per-vertex opacity. */
export const createIsoGrid = (): IsoGridBinding => {
  const { positions, colors } = buildGridArrays()
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))

  const material = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true })
  const object = new THREE.LineSegments(geometry, material)

  return {
    object,
    apply(color: number): void {
      material.color.setHex(color)
    },
    dispose(): void {
      geometry.dispose()
      material.dispose()
    }
  }
}
