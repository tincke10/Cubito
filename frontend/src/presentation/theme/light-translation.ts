// Test-side verification only: proves lightPalette really is a translation of darkPalette
// through frontend/design/mockups/make-light.mjs's RULES. Not imported by production code —
// tsconfig's `include: ["src"]` keeps make-light.mjs itself out of the typecheck.

export type TokenContext = 'fill' | 'stroke' | 'text' | 'css'

const HEX_PATTERN = /#([0-9a-fA-F]{6})/

const buildSnippet = (hex: string, context: TokenContext): string => {
  switch (context) {
    case 'fill':
      return `fill="#${hex}"`
    case 'stroke':
      return `stroke="#${hex}"`
    case 'text':
      return `<text fill="#${hex}">`
    case 'css':
      return `color: #${hex}`
  }
}

/** Runs `hex` (context-wrapped) through RULES verbatim; returns the resulting bare hex. */
export const translateToLight = (
  hex: string,
  context: TokenContext,
  rules: readonly (readonly [RegExp, string])[]
): string => {
  const translated = rules.reduce<string>(
    (text, [pattern, replacement]) => text.replace(pattern, replacement),
    buildSnippet(hex, context)
  )
  const match = HEX_PATTERN.exec(translated)
  if (!match) {
    throw new Error(`translateToLight: no hex found after applying RULES to "${translated}"`)
  }
  return match[1] as string
}

/**
 * The SVG/CSS context each flattened ScenePalette token plays in the mockups, used to pick
 * which RULES entry (if any) applies. Dotted keys address FaceTriad members.
 */
export const TOKEN_CONTEXTS: Record<string, TokenContext> = {
  background: 'css',
  vignetteEdge: 'css',
  gridLine: 'stroke',
  'rootFaces.top': 'fill',
  'rootFaces.left': 'fill',
  'rootFaces.right': 'fill',
  'activeFaces.top': 'fill',
  'activeFaces.left': 'fill',
  'activeFaces.right': 'fill',
  'waitingFaces.top': 'fill',
  'waitingFaces.left': 'fill',
  'waitingFaces.right': 'text',
  'idleFaces.top': 'fill',
  'idleFaces.left': 'fill',
  'idleFaces.right': 'fill',
  archivedStroke: 'stroke',
  spawningStroke: 'text',
  edgeNormal: 'stroke',
  edgeFlow: 'text',
  edgeFaint: 'stroke',
  accent: 'css',
  accentBright: 'css',
  amber: 'css',
  amberDim: 'css',
  amberInk: 'fill',
  info: 'text',
  textPrimary: 'css',
  textDim: 'css',
  textFaint: 'css',
  keyChip: 'css',
  panelSurface: 'css',
  panelBorder: 'css',
  shadow: 'fill'
}
