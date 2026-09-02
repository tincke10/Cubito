import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { darkPalette, lightPalette, UNMAPPED_IN_LIGHT } from './scene-palette'
import type { FaceTriad, ScenePalette } from './scene-palette'
import { TOKEN_CONTEXTS, translateToLight } from './light-translation'

type MakeLightModule = {
  RULES: readonly (readonly [RegExp, string])[]
}

// make-light.mjs is a CLI script with a top-level file-writing loop keyed off process.cwd();
// chdir into its directory for the import so that loop resolves its relative reads/writes,
// then restore — this is a pre-existing side effect of the script, not introduced here.
const importMakeLight = async (): Promise<MakeLightModule> => {
  const previousCwd = process.cwd()
  process.chdir(fileURLToPath(new URL('../../../design/mockups', import.meta.url)))
  try {
    // @ts-expect-error — make-light.mjs is untyped mockup tooling, not part of tsconfig's src include
    return (await import('../../../design/mockups/make-light.mjs')) as MakeLightModule
  } finally {
    process.chdir(previousCwd)
  }
}

const { RULES } = await importMakeLight()

const toHex = (n: number): string => n.toString(16).padStart(6, '0')

const FACE_TRIAD_FIELDS = ['rootFaces', 'activeFaces', 'waitingFaces', 'idleFaces'] as const

/** Flattens ScenePalette into dotted-key → hex-number entries, matching TOKEN_CONTEXTS' keys. */
const flatten = (palette: ScenePalette): Record<string, number> => {
  const out: Record<string, number> = {}
  for (const [key, value] of Object.entries(palette)) {
    if (typeof value === 'number') {
      out[key] = value
    } else {
      const triad = value as FaceTriad
      out[`${key}.top`] = triad.top
      out[`${key}.left`] = triad.left
      out[`${key}.right`] = triad.right
    }
  }
  return out
}

describe('light-translation ratchet', () => {
  const flatDark = flatten(darkPalette)
  const flatLight = flatten(lightPalette)
  const unmapped = new Set<string>(UNMAPPED_IN_LIGHT)

  it('every FaceTriad field is covered by a flattened dotted key', () => {
    for (const field of FACE_TRIAD_FIELDS) {
      expect(flatDark[`${field}.top`]).not.toBeUndefined()
      expect(flatDark[`${field}.left`]).not.toBeUndefined()
      expect(flatDark[`${field}.right`]).not.toBeUndefined()
    }
  })

  it('translates every mapped token from dark to exactly its light value', () => {
    for (const key of Object.keys(flatDark)) {
      if (unmapped.has(key as (typeof UNMAPPED_IN_LIGHT)[number])) continue
      const context = TOKEN_CONTEXTS[key]
      expect(context, `missing TOKEN_CONTEXTS[${key}]`).toBeDefined()
      const translated = translateToLight(toHex(flatDark[key] as number), context!, RULES)
      expect(translated, key).toBe(toHex(flatLight[key] as number))
    }
  })

  it('UNMAPPED_IN_LIGHT holds only tokens make-light.mjs truly cannot translate yet', () => {
    expect(UNMAPPED_IN_LIGHT.length).toBeLessThanOrEqual(7)
    for (const key of UNMAPPED_IN_LIGHT) {
      const context = TOKEN_CONTEXTS[key]
      expect(context, `missing TOKEN_CONTEXTS[${key}]`).toBeDefined()
      const dark = flatDark[key] as number
      const translated = translateToLight(toHex(dark), context!, RULES)
      // fails the day someone adds a RULES entry for this hex — shrink the list then.
      expect(translated, key).toBe(toHex(dark))
    }
  })
})
