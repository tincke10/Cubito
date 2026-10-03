import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC_ROOT = join(import.meta.dirname, '..', '..')
const SPANISH_CHARS = /[áéíóúñ¿¡ÁÉÍÓÚÑ]/
const STRING_OR_COMMENT =
  /('(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"|`(?:\\.|[^`\\])*`)|\/\/[^\n]*|\/\*[\s\S]*?\*\//g

/** Files allowed to hold Spanish-only literals, each with the reason it is not UI copy. */
const ALLOWLIST: Readonly<Record<string, string>> = {}

/** String-literal tokens (comments dropped) that contain a Spanish-only character. */
export function spanishLiterals(source: string): string[] {
  const found: string[] = []
  for (const match of source.matchAll(STRING_OR_COMMENT)) {
    const literal = match[1]
    if (literal !== undefined && SPANISH_CHARS.test(literal)) found.push(literal)
  }
  return found
}

const isDictionary = (path: string): boolean =>
  path.split(sep).join('/').startsWith('application/i18n/messages/')

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) return sourceFiles(full)
    return entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') ? [full] : []
  })
}

describe('spanishLiterals', () => {
  it('flags accented and inverted-punctuation string literals', () => {
    expect(spanishLiterals('const a = \'código\'; const b = `¿ok?`; const c = "año"')).toEqual([
      "'código'",
      '`¿ok?`',
      '"año"'
    ])
  })

  it('ignores comments and plain-ASCII literals', () => {
    expect(spanishLiterals("// está acá\n/* ñandú */ const a = 'plain'")).toEqual([])
  })

  it('does not mistake // inside a string for a comment', () => {
    expect(spanishLiterals("const a = 'http://x/ñ'")).toEqual(["'http://x/ñ'"])
  })
})

describe('frontend source has no Spanish-only literals outside the dictionaries', () => {
  it('moves user-facing copy into application/i18n/messages', () => {
    const offenders: string[] = []
    for (const file of sourceFiles(SRC_ROOT)) {
      const path = relative(SRC_ROOT, file)
      if (isDictionary(path) || path.split(sep).join('/') in ALLOWLIST) continue
      for (const literal of spanishLiterals(readFileSync(file, 'utf8'))) {
        offenders.push(`${path}: ${literal}`)
      }
    }
    expect(offenders).toEqual([])
  })
})
