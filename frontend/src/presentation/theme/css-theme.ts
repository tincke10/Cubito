import type { FaceTriad, ScenePalette } from './scene-palette'

const toKebab = (name: string): string => name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()

const toHex = (value: number): string => '#' + value.toString(16).padStart(6, '0')

const isFaceTriad = (value: number | FaceTriad): value is FaceTriad => typeof value === 'object'

/** Hex strings are derived from the numeric palette so DOM and GPU can never drift. */
export const cssVarsFor = (palette: ScenePalette): Record<string, string> => {
  const vars: Record<string, string> = {}
  for (const [key, value] of Object.entries(palette) as Array<[string, number | FaceTriad]>) {
    const prefix = `--cubito-${toKebab(key)}`
    if (isFaceTriad(value)) {
      for (const [faceKey, faceValue] of Object.entries(value)) {
        vars[`${prefix}-${toKebab(faceKey)}`] = toHex(faceValue)
      }
    } else {
      vars[prefix] = toHex(value)
    }
  }
  return vars
}

/** Untested by design (3-line DOM writer) — exercised only by manual/E5 wiring. */
export const applyCssTheme = (root: HTMLElement, palette: ScenePalette): void => {
  for (const [name, value] of Object.entries(cssVarsFor(palette))) {
    root.style.setProperty(name, value)
  }
}
