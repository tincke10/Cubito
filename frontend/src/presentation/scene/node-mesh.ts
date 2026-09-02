import * as THREE from 'three'
import type { Vec3 } from '../camera/camera-framing'
import type { NodeLabelModel } from '../hud/node-label-model'
import { pulseOpacity } from '../theme/pulse-cycle'
import type { Elevation } from '../theme/node-elevation'
import type { NodeVisual } from '../theme/node-visual'
import { GLOW_SPRITE_SCALE, SHADOW_Y, UNREAD_DOT_OFFSET } from '../theme/scene-metrics'
import type { SceneResources } from './scene-resources'

/**
 * `Elevation.shadow` (B7) carries radius/opacity only; the disc's color is theme-dependent
 * (`ScenePalette.shadow`), so the caller (graph-view, D6) threads it in alongside apply()'s
 * other inputs rather than widening the domain `Elevation` type owned by another module.
 */
export type NodeBindingInput = {
  visual: NodeVisual
  elevation: Elevation
  ground: Vec3
  label: NodeLabelModel
  shadowColor: number
}

export type NodeBinding = {
  object: THREE.Group
  apply(input: NodeBindingInput): void
  tick(elapsedSeconds: number): void
  dispose(): void
}

type SurfaceKind = 'solid' | 'wireframe'

const faceMaterialGroups = [0, 0, 1, 1, 2, 2] as const // BoxGeometry groups → [right, right, top, top, left, left]

export const createNodeBinding = (resources: SceneResources): NodeBinding => {
  const group = new THREE.Group()

  let surface: THREE.Mesh | THREE.LineSegments | null = null
  // Tracked separately from `surface.material` because the solid surface assigns the same 3
  // material instances across 6 geometry groups (paired faces) — disposing via `.material`
  // would iterate duplicates and fire each material's 'dispose' event twice.
  let surfaceMaterials: THREE.Material[] = []
  let lastSurfaceKind: SurfaceKind | null = null

  const shadowMaterial = new THREE.MeshBasicMaterial({ transparent: true })
  const shadowMesh = new THREE.Mesh(resources.shadowGeometry, shadowMaterial)
  shadowMesh.name = 'shadow'
  shadowMesh.rotation.x = -Math.PI / 2
  shadowMesh.visible = false
  group.add(shadowMesh)

  const glowMaterial = new THREE.SpriteMaterial({
    map: resources.glowTexture,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false
  })
  const glowSprite = new THREE.Sprite(glowMaterial)
  glowSprite.name = 'glow'
  glowSprite.visible = false
  group.add(glowSprite)

  const ringMaterial = new THREE.LineBasicMaterial({ transparent: true })
  // Ring reuses the shared unit-radius LineSegmentsGeometry (resources.ringGeometry) via scale;
  // a plain LineSegments (not LineSegments2) keeps it dependency-free until D3's setResolution
  // pattern is extended here — flagged in apply-progress for the graph-view integrator.
  const ringMesh = new THREE.LineSegments(resources.ringGeometry, ringMaterial)
  ringMesh.name = 'ring'
  ringMesh.visible = false
  group.add(ringMesh)

  const dotMaterial = new THREE.SpriteMaterial({
    map: resources.dotTexture,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false
  })
  const dotSprite = new THREE.Sprite(dotMaterial)
  dotSprite.name = 'dot'
  dotSprite.visible = false
  group.add(dotSprite)

  let pulseGlow = false
  let pulseDot = false
  let glowBaseOpacity = 0

  const rebuildSurface = (kind: SurfaceKind): void => {
    if (surface !== null) {
      group.remove(surface)
      for (const material of surfaceMaterials) material.dispose()
    }
    if (kind === 'solid') {
      const materials: [THREE.MeshBasicMaterial, THREE.MeshBasicMaterial, THREE.MeshBasicMaterial] = [
        new THREE.MeshBasicMaterial(),
        new THREE.MeshBasicMaterial(),
        new THREE.MeshBasicMaterial()
      ]
      // faceMaterialGroups is a fixed [0,1,2]-valued tuple matching `materials`' length by construction.
      const mesh = new THREE.Mesh(resources.cubeGeometry, faceMaterialGroups.map((i) => materials[i]))
      mesh.name = 'surface'
      surface = mesh
      surfaceMaterials = materials
    } else {
      const material = new THREE.LineDashedMaterial({ transparent: true })
      const lines = new THREE.LineSegments(resources.wireGeometry, material)
      lines.computeLineDistances()
      lines.name = 'surface'
      surface = lines
      surfaceMaterials = [material]
    }
    group.add(surface)
    lastSurfaceKind = kind
  }

  const applySurface = (visual: NodeVisual): void => {
    const kind: SurfaceKind = visual.surface.kind
    if (lastSurfaceKind !== kind || surface === null) rebuildSurface(kind)

    if (visual.surface.kind === 'solid') {
      const [right, top, left] = surfaceMaterials as THREE.MeshBasicMaterial[]
      right?.color.setHex(visual.surface.faces.right)
      top?.color.setHex(visual.surface.faces.top)
      left?.color.setHex(visual.surface.faces.left)
    } else {
      const lines = surface as THREE.LineSegments
      const material = lines.material as THREE.LineDashedMaterial
      material.color.setHex(visual.surface.stroke)
      material.opacity = visual.surface.opacity
      const [dashSize, gapSize] = visual.surface.dash
      material.dashSize = dashSize
      material.gapSize = gapSize
      lines.computeLineDistances()
    }
  }

  const applyShadow = (elevation: Elevation, shadowColor: number): void => {
    if (elevation.shadow === null) {
      shadowMesh.visible = false
      return
    }
    shadowMesh.visible = true
    shadowMesh.position.y = SHADOW_Y - (elevation.height + resources.cubeGeometry.parameters.height / 2)
    shadowMesh.scale.setScalar(elevation.shadow.radius)
    shadowMaterial.color.setHex(shadowColor)
    shadowMaterial.opacity = elevation.shadow.opacity
  }

  const applyGlow = (visual: NodeVisual): void => {
    if (visual.glow === null) {
      glowSprite.visible = false
      pulseGlow = false
      return
    }
    glowSprite.visible = true
    glowSprite.scale.setScalar(GLOW_SPRITE_SCALE)
    glowMaterial.color.setHex(visual.glow.color)
    glowBaseOpacity = visual.glow.intensity
    glowMaterial.opacity = glowBaseOpacity
    pulseGlow = visual.pulse
  }

  const applyRing = (visual: NodeVisual): void => {
    if (visual.ring === null) {
      ringMesh.visible = false
      return
    }
    ringMesh.visible = true
    ringMesh.scale.set(visual.ring.radius, 1, visual.ring.radius)
    ringMaterial.color.setHex(visual.ring.color)
  }

  const applyDot = (visual: NodeVisual, surfaceCenterY: number): void => {
    if (visual.dot === null) {
      dotSprite.visible = false
      pulseDot = false
      return
    }
    dotSprite.visible = true
    dotSprite.position.set(UNREAD_DOT_OFFSET.x, surfaceCenterY + UNREAD_DOT_OFFSET.y, UNREAD_DOT_OFFSET.z)
    dotMaterial.color.setHex(visual.dot.color)
    pulseDot = visual.dot.pulse
  }

  return {
    object: group,
    apply({ visual, elevation, ground, shadowColor }: NodeBindingInput): void {
      // DOM label wiring lands with E1 (node-label-element.ts, DOM overlay agent) — not built yet.
      group.position.set(ground.x, 0, ground.z)
      const surfaceCenterY = elevation.height + resources.cubeGeometry.parameters.height / 2
      applySurface(visual)
      if (surface !== null) surface.position.y = surfaceCenterY
      glowSprite.position.y = surfaceCenterY
      ringMesh.position.y = elevation.height
      applyShadow(elevation, shadowColor)
      applyGlow(visual)
      applyRing(visual)
      applyDot(visual, surfaceCenterY)
    },
    tick(elapsedSeconds: number): void {
      if (pulseGlow) glowMaterial.opacity = glowBaseOpacity * pulseOpacity(elapsedSeconds)
      if (pulseDot) dotMaterial.opacity = pulseOpacity(elapsedSeconds)
    },
    dispose(): void {
      for (const material of surfaceMaterials) material.dispose()
      shadowMaterial.dispose()
      glowMaterial.dispose()
      ringMaterial.dispose()
      dotMaterial.dispose()
    }
  }
}
