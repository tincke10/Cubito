import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js'
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js'
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js'
import type { Vec3 } from '../camera/camera-framing'
import { flowDashOffset, type EdgeVisual } from '../theme/edge-visual'

export type EdgeBindingInput = {
  visual: EdgeVisual
  from: Vec3
  to: Vec3
}

export type EdgeBinding = {
  object: LineSegments2
  apply(input: EdgeBindingInput): void
  tick(elapsedSeconds: number): void
  setResolution(width: number, height: number): void
  dispose(): void
}

/** Per-edge geometry (endpoints differ per edge) + `LineMaterial` — core `LineDashedMaterial`
 *  has no `dashOffset` and `LineBasicMaterial.linewidth` is inert in WebGL (design §0.3). */
export const createEdgeBinding = (): EdgeBinding => {
  const geometry = new LineSegmentsGeometry()
  const material = new LineMaterial({ transparent: true })
  const object = new LineSegments2(geometry, material)

  return {
    object,
    apply({ visual, from, to }: EdgeBindingInput): void {
      geometry.setPositions([from.x, from.y, from.z, to.x, to.y, to.z])
      object.computeLineDistances()

      material.color.setHex(visual.color)
      material.opacity = visual.opacity
      material.linewidth = visual.width
      material.dashed = visual.dash !== null
      if (visual.dash !== null) {
        material.dashSize = visual.dash.size
        material.gapSize = visual.dash.gap
      }
      material.needsUpdate = true
    },
    tick(elapsedSeconds: number): void {
      // Global clock, no per-edge phase state (design §5.5) — every flowing edge marches in lockstep.
      material.dashOffset = flowDashOffset(elapsedSeconds)
    },
    // Required so the caller (create-scene.ts's onResize) can keep every edge's screen-space
    // linewidth/dash correct — forgetting this is design's Residual Risk #2.
    setResolution(width: number, height: number): void {
      material.resolution.set(width, height)
    },
    dispose(): void {
      geometry.dispose()
      material.dispose()
    }
  }
}
