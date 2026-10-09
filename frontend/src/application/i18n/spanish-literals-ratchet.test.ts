import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { describe, expect, it } from 'vitest'
import { en } from './messages/en'

const SRC_ROOT = join(import.meta.dirname, '..', '..')
const SPANISH_CHARS = /[áéíóúñ¿¡ÁÉÍÓÚÑ]/
const STRING_OR_COMMENT =
  /('(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"|`(?:\\.|[^`\\])*`)|\/\/[^\n]*|\/\*[\s\S]*?\*\//g

/** Files allowed to hold Spanish-only literals, each with the reason it is not UI copy. */
const ALLOWLIST: Readonly<Record<string, string>> = {}

/** Common unaccented Spanish words the accent check cannot see. Excludes words that are also
 *  English ('sin', 'sale', 'son', 'me'…) so a clean English dictionary never false-positives. */
const SPANISH_WORDS = [
  'agente',
  'rama',
  'hijo',
  'padre',
  'nodo',
  'desde',
  'listo',
  'cargando',
  'camada',
  'trabajando',
  'esperando',
  'ninguno',
  'guardar',
  'borrar',
  'abrir',
  'cerrar',
  'cancelar',
  'aceptar',
  'siguiente',
  'anterior',
  'volver',
  'buscar',
  'cambios',
  'archivo',
  'archivos',
  'carpeta',
  'proyecto',
  'conectando',
  'conectado',
  'desconectado',
  'fallo',
  'cubo',
  'cubos'
]
const SPANISH_WORD = new RegExp(
  `(?<![\\p{L}\\p{N}_])(?:${SPANISH_WORDS.join('|')})(?![\\p{L}\\p{N}_])`,
  'iu'
)

/** Literals allowed to hold a denylisted word, each with the reason it is not displayed copy. */
const WORD_ALLOWLIST: Readonly<Record<string, string>> = {
  "'isla'": 'internal CameraHeight id, never rendered',
  "'foco'": 'internal CameraHeight id, never rendered',
  "'comparar'": 'internal CameraHeight id, never rendered'
}

const isModuleSpecifier = (source: string, index: number): boolean =>
  /(?:\bfrom|\bimport\s*\(?|\bvi\.mock\(|\brequire\()\s*$/.test(
    source.slice(Math.max(0, index - 20), index)
  )

/** Literals (comments and module specifiers dropped) that contain a whole-word Spanish term. */
export function spanishWordLiterals(source: string): string[] {
  const found: string[] = []
  for (const match of source.matchAll(STRING_OR_COMMENT)) {
    const literal = match[1]
    if (literal === undefined || literal in WORD_ALLOWLIST) continue
    if (isModuleSpecifier(source, match.index)) continue
    if (SPANISH_WORD.test(literal)) found.push(literal)
  }
  return found
}

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

describe('spanishWordLiterals', () => {
  it('flags whole Spanish words, case-insensitively', () => {
    expect(spanishWordLiterals("const a = 'agente'; const b = `Cargando…`")).toEqual([
      "'agente'",
      '`Cargando…`'
    ])
  })

  it('ignores substrings, English words and module specifiers', () => {
    expect(
      spanishWordLiterals(
        "import x from './camada-poll'; const a = 'agent'; const b = 'sin'; const c = 'ramal'"
      )
    ).toEqual([])
  })

  it('ignores allowlisted internal ids', () => {
    expect(spanishWordLiterals("const a = 'isla'")).toEqual([])
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

describe('frontend source has no unaccented Spanish words outside the es dictionaries', () => {
  it('keeps non-dictionary string literals free of Spanish words', () => {
    const offenders: string[] = []
    for (const file of sourceFiles(SRC_ROOT)) {
      const path = relative(SRC_ROOT, file)
      if (isDictionary(path)) continue
      for (const literal of spanishWordLiterals(readFileSync(file, 'utf8'))) {
        offenders.push(`${path}: ${literal}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('keeps every en dictionary value free of Spanish words', () => {
    const offenders = Object.entries(en).filter(([, value]) => SPANISH_WORD.test(value))
    expect(offenders).toEqual([])
  })
})
