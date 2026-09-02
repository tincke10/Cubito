import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { NODE_KINDS } from '../../domain/worktree-graph/types'
import { NODE_STATES } from '../theme/node-state'

/**
 * Scene-purity ratchet (design §8, NG-300). Reads sources as TEXT — never imports them —
 * so it also covers files that touch `document`/`window` (create-scene.ts).
 *
 * Known, deliberate limitations: comment- and string-stripping are regex-based, so a hex
 * or a number that lives inside a string that looks like a comment (or inside a template
 * literal's `${}`) can be mis-handled. The failure direction is toward false positives,
 * which get noticed, not false negatives, which do not.
 *
 * Scope, per design §8: rule 1 (no colour literals) covers scene/, hud/ and input/, because
 * every DOM module must go through `cssVarsFor`. Rules 2-4 cover scene/ only — hud/ hosts the
 * pure `*-model` modules whose whole job is NodeState branching, and both hud/ and input/
 * legitimately read `SceneState` from the application layer.
 */

const SCENE_DIR = fileURLToPath(new URL('.', import.meta.url))
const PRESENTATION_DIR = path.resolve(SCENE_DIR, '..')
const COLOR_CHECKED_DIRS = [SCENE_DIR, path.join(PRESENTATION_DIR, 'hud'), path.join(PRESENTATION_DIR, 'input')]

/**
 * Justified, reviewed carve-outs. Each key is a path relative to `presentation/`, each value
 * the exact violation strings tolerated in that file. A stale entry is a bug — the companion
 * test below fails if the file is gone or no longer produces the listed violation.
 */
const PURITY_EXCEPTIONS: Record<string, readonly string[]> = {
  // Rasterization/tessellation resolution, plus Float32Array stride arithmetic. These are
  // implementation detail of the shared-resource factory (how many texels a glow texture has,
  // how many segments a disc is tessellated into), not mockup-measured visual tuning values,
  // so they are not `scene-metrics.ts` material. Follow-up if that judgement flips: move the
  // six named constants into scene-metrics.ts and shrink this list to the stride literals.
  // 255 = opaque byte for the RGBA expansion WebGL2 requires; not a visual tuning value
  'scene/scene-resources.ts': ['4', '5', '6', '16', '32', '48', '64', '255']
}

const NUMERIC_ALLOWLIST = new Set(['0', '1', '2', '3', '-1', '0.5'])

/** scene/ may reach the pure layers and the domain — never the application or infrastructure. */
const ALLOWED_SCENE_IMPORTS = [
  /^three(\/.*)?$/,
  /^\.\.\/theme\//,
  /^\.\.\/layout\//,
  /^\.\.\/camera\//,
  /^\.\.\/hud\/[\w-]+-model$/,
  // Relocated by tanda 4c from scene/ to hud/; it is the DOM half of the label pair, no logic.
  /^\.\.\/hud\/node-label-element$/,
  /^\.\.\/\.\.\/domain\//,
  /^\.\/[\w-]+$/
]

const stripComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1')

const stripStrings = (source: string): string =>
  source
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
    .replace(/`(?:[^`\\]|\\.)*`/g, '``')

const COLOR_LITERAL = /\b0x[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3,8}\b/g
const NUMERIC_LITERAL = /(?<![\w.$])-?\d+(?:\.\d+)?(?![\w])/g
const IMPORT_SPECIFIER = /\bfrom\s*'([^']+)'/g

const colorViolations = (source: string): string[] => [...stripComments(source).matchAll(COLOR_LITERAL)].map((m) => m[0])

const numericViolations = (source: string): string[] =>
  [...stripStrings(stripComments(source)).matchAll(NUMERIC_LITERAL)]
    .map((m) => m[0])
    .filter((literal) => !NUMERIC_ALLOWLIST.has(literal))

/** Types are erased at runtime, so the runtime `NODE_STATES`/`NODE_KINDS` arrays are the source
 *  of truth: an eighth state extends the ban automatically, with no edit to this file. */
const domainLiteralViolations = (source: string): string[] => {
  const stripped = stripComments(source)
  return [...NODE_STATES, ...NODE_KINDS].filter((literal) =>
    new RegExp(`['"\`]${literal}['"\`]`).test(stripped)
  )
}

const importViolations = (source: string): string[] =>
  [...stripComments(source).matchAll(IMPORT_SPECIFIER)]
    .map((match) => match[1] ?? '')
    .filter((specifier) => !ALLOWED_SCENE_IMPORTS.some((allowed) => allowed.test(specifier)))

const withoutExceptions = (relativePath: string, violations: readonly string[]): string[] => {
  const allowed = PURITY_EXCEPTIONS[relativePath] ?? []
  return violations.filter((violation) => !allowed.includes(violation))
}

type SourceFile = { relativePath: string; source: string }

const sourcesIn = (dir: string): SourceFile[] =>
  readdirSync(dir)
    .filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts'))
    .map((name) => ({
      relativePath: path.relative(PRESENTATION_DIR, path.join(dir, name)),
      source: readFileSync(path.join(dir, name), 'utf8')
    }))

const sceneSources = sourcesIn(SCENE_DIR)
const colorCheckedSources = COLOR_CHECKED_DIRS.flatMap(sourcesIn)

describe('scene purity ratchet — the checks themselves', () => {
  it('catches a seeded colour literal in either notation', () => {
    expect(colorViolations('const c = 0x9fef00')).toEqual(['0x9fef00'])
    expect(colorViolations("el.style.color = '#9fef00'")).toEqual(['#9fef00'])
  })

  it('ignores a colour literal that only appears in a comment', () => {
    expect(colorViolations('// accent is 0x9fef00\nconst c = palette.accent')).toEqual([])
  })

  it('catches a seeded magic number but allows index and halving literals', () => {
    expect(numericViolations('const gap = 26')).toEqual(['26'])
    expect(numericViolations('const y = height * 0.5 + items[2] - 1')).toEqual([])
  })

  it('does not mistake digits inside identifiers for numeric literals', () => {
    expect(numericViolations('new THREE.Vector2(); new Float32BufferAttribute(a, 3)')).toEqual([])
  })

  it('catches a seeded NodeState or NodeKind literal', () => {
    expect(domainLiteralViolations("if (state === 'archived') return null")).toEqual(['archived'])
    expect(domainLiteralViolations("if (kind === 'root') return faces")).toEqual(['root'])
  })

  it('derives the forbidden literal list from the runtime arrays, so a new state extends it', () => {
    for (const state of NODE_STATES) {
      expect(domainLiteralViolations(`x === '${state}'`)).toEqual([state])
    }
  })

  it('catches a seeded application/infrastructure import and allows the pure layers', () => {
    expect(importViolations("import { x } from '../../application/scene-store'")).toEqual([
      '../../application/scene-store'
    ])
    expect(importViolations("import { y } from '../../infrastructure/rpc/envelope'")).toEqual([
      '../../infrastructure/rpc/envelope'
    ])
    expect(
      importViolations(
        "import * as THREE from 'three'\nimport { a } from '../theme/scene-metrics'\nimport { b } from './node-mesh'"
      )
    ).toEqual([])
  })

  it('suppresses exactly the violations an exception lists, and nothing else', () => {
    expect(withoutExceptions('scene/scene-resources.ts', ['64', '7'])).toEqual(['7'])
    expect(withoutExceptions('scene/graph-view.ts', ['64'])).toEqual(['64'])
  })
})

describe('scene purity ratchet — the real sources', () => {
  it('finds files to check in every guarded directory', () => {
    expect(sceneSources.length).toBeGreaterThan(0)
    expect(colorCheckedSources.length).toBeGreaterThan(sceneSources.length)
  })

  it.each(colorCheckedSources)('$relativePath declares no colour literal', ({ relativePath, source }) => {
    expect(withoutExceptions(relativePath, colorViolations(source))).toEqual([])
  })

  it.each(sceneSources)('$relativePath declares no magic number', ({ relativePath, source }) => {
    expect(withoutExceptions(relativePath, numericViolations(source))).toEqual([])
  })

  it.each(sceneSources)('$relativePath branches on no NodeState or NodeKind', ({ relativePath, source }) => {
    expect(withoutExceptions(relativePath, domainLiteralViolations(source))).toEqual([])
  })

  it.each(sceneSources)('$relativePath imports no application or infrastructure module', ({
    relativePath,
    source
  }) => {
    expect(withoutExceptions(relativePath, importViolations(source))).toEqual([])
  })
})

describe('scene purity ratchet — no stale exceptions', () => {
  it.each(Object.entries(PURITY_EXCEPTIONS))('%s still exists and still needs every listed exception', (
    relativePath,
    allowed
  ) => {
    const file = sceneSources.find((candidate) => candidate.relativePath === relativePath)
    expect(file, `exception for a file that no longer exists: ${relativePath}`).toBeDefined()
    const source = (file as SourceFile).source
    const found = new Set([
      ...colorViolations(source),
      ...numericViolations(source),
      ...domainLiteralViolations(source),
      ...importViolations(source)
    ])
    for (const violation of allowed) {
      expect(found, `stale exception "${violation}" in ${relativePath}`).toContain(violation)
    }
  })
})
