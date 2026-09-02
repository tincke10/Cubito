// Colors only — no numbers, no THREE. Numbers live in scene-metrics.ts.
// Dark values are verbatim from frontend/design/mockups/Main.dc.html + EstadosNodo.dc.html.
// Light values are the current design/mockups/make-light.mjs RULES applied per-token
// context (see light-translation.ts) — verified against the *Light.dc.html mockups.

export type Theme = 'dark' | 'light'

export type FaceTriad = {
  top: number
  left: number
  right: number
}

export type ScenePalette = {
  background: number
  vignetteEdge: number
  gridLine: number
  rootFaces: FaceTriad
  activeFaces: FaceTriad
  waitingFaces: FaceTriad
  idleFaces: FaceTriad
  archivedStroke: number
  spawningStroke: number
  edgeNormal: number
  edgeFlow: number
  edgeFaint: number
  accent: number
  accentBright: number
  amber: number
  amberDim: number
  amberInk: number
  info: number
  textPrimary: number
  textDim: number
  textFaint: number
  keyChip: number
  panelSurface: number
  panelBorder: number
  shadow: number
}

export const darkPalette: ScenePalette = {
  background: 0x0a0e12,
  vignetteEdge: 0x05080b,
  gridLine: 0x10231a,
  rootFaces: { top: 0xb7ff33, left: 0x567f00, right: 0x85c400 },
  activeFaces: { top: 0x7ecbff, left: 0x17557f, right: 0x2ea8ff },
  waitingFaces: { top: 0xffcb52, left: 0x8f5c00, right: 0xe8a200 },
  idleFaces: { top: 0x3d4b57, left: 0x1d262e, right: 0x2c3945 },
  archivedStroke: 0x3d4b57,
  spawningStroke: 0x2ea8ff,
  edgeNormal: 0x3a5f3a,
  edgeFlow: 0x2ea8ff,
  edgeFaint: 0x3a5f3a,
  accent: 0x9fef00,
  accentBright: 0xb7ff33,
  amber: 0xffb000,
  amberDim: 0xb58200,
  amberInk: 0xe8a200,
  info: 0x2ea8ff,
  textPrimary: 0xc8d3da,
  textDim: 0x6b7a85,
  textFaint: 0x4a5a64,
  keyChip: 0x8fa3ad,
  panelSurface: 0x0d1319,
  panelBorder: 0x1b2833,
  shadow: 0x000000
}

export const lightPalette: ScenePalette = {
  background: 0xf2f5f0,
  vignetteEdge: 0xe6ebe3,
  gridLine: 0xd9e2d2,
  // root triad has no light rule yet — see UNMAPPED_IN_LIGHT
  rootFaces: { top: 0xb7ff33, left: 0x567f00, right: 0x85c400 },
  // .right (bare fill) has no light rule yet — see UNMAPPED_IN_LIGHT
  activeFaces: { top: 0x8fd0ff, left: 0x1273b8, right: 0x2ea8ff },
  // .top/.left have no light rule yet — see UNMAPPED_IN_LIGHT
  waitingFaces: { top: 0xffcb52, left: 0x8f5c00, right: 0xa36b00 },
  idleFaces: { top: 0xcdd7dd, left: 0x8d9ba5, right: 0xaebac2 },
  archivedStroke: 0x9aa7b0,
  spawningStroke: 0x1273c4,
  edgeNormal: 0x7c997c,
  edgeFlow: 0x1273c4,
  edgeFaint: 0x7c997c,
  accent: 0x4d8a00,
  accentBright: 0xb7ff33,
  amber: 0xa36b00,
  amberDim: 0x8a6b1f,
  // no light rule yet — see UNMAPPED_IN_LIGHT
  amberInk: 0xe8a200,
  info: 0x1273c4,
  textPrimary: 0x23313a,
  textDim: 0x5c6b75,
  textFaint: 0x8a97a0,
  keyChip: 0x3c4c56,
  panelSurface: 0xffffff,
  panelBorder: 0xdbe3e8,
  shadow: 0x43555f
}

export const paletteFor = (theme: Theme): ScenePalette => (theme === 'dark' ? darkPalette : lightPalette)

/**
 * Tokens for which frontend/design/mockups/make-light.mjs's RULES table has no light
 * mapping in their real context — translateToLight returns them unchanged. Tracked as a
 * ratchet (see light-translation.test.ts): may only shrink as RULES gains coverage, never grow.
 */
export const UNMAPPED_IN_LIGHT = [
  'rootFaces.top',
  'rootFaces.left',
  'rootFaces.right',
  'waitingFaces.top',
  'waitingFaces.left',
  'activeFaces.right',
  'amberInk'
] as const
