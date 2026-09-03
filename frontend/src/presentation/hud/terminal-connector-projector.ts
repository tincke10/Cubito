export type NdcPoint = { x: number; y: number; z: number }
export type ScreenPoint = { x: number; y: number; visible: boolean }

/**
 * NDC (camera-projected, [-1,1] per axis) -> viewport pixels for the dashed connector overlay
 * (design Area 6). The camera projection itself is impure (THREE-dependent) and lives in the
 * DOM element; this is the pure remainder, unit-tested in isolation.
 */
export function projectToScreen(
  ndc: NdcPoint,
  viewportWidth: number,
  viewportHeight: number
): ScreenPoint {
  return {
    x: (ndc.x * 0.5 + 0.5) * viewportWidth,
    y: (1 - (ndc.y * 0.5 + 0.5)) * viewportHeight,
    visible: ndc.z >= -1 && ndc.z <= 1
  }
}
