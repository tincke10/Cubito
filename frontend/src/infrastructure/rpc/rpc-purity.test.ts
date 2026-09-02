import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * rpc-purity ratchet (design D7, CO-112). Reads sources as TEXT — never imports them —
 * following the `scene-purity.test.ts` precedent so the checks themselves are unit-testable.
 *
 * Rule 1: no file under `src/infrastructure/rpc` imports `src/shared` or escapes the
 * `frontend/` package root (keeps `Buffer`/`zod`/`ws`/`node:crypto` out of the vite bundle).
 * Rule 2: no file references browser storage globals (memory-only keys).
 * Rule 3: `fake-orcad-server.ts` is imported only from `*.test.ts` files (keeps the `ws`
 * devDependency out of the vite bundle).
 */

const RPC_DIR = fileURLToPath(new URL('.', import.meta.url))
const FRONTEND_SRC_DIR = path.resolve(RPC_DIR, '..', '..')

const ESCAPES_FRONTEND_ROOT = /^(?:\.\.\/){4,}/
const REACHES_SRC_SHARED = /(?:^|\/)src\/shared(?:\/|$)/
const IMPORT_SPECIFIER = /\bfrom\s*'([^']+)'/g
const STORAGE_GLOBAL = /\b(?:localStorage|sessionStorage|indexedDB)\b|document\.cookie/g

const stripComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1')

const importViolations = (source: string): string[] =>
  [...stripComments(source).matchAll(IMPORT_SPECIFIER)]
    .map((match) => match[1] ?? '')
    .filter((specifier) => ESCAPES_FRONTEND_ROOT.test(specifier) || REACHES_SRC_SHARED.test(specifier))

const globalReferenceViolations = (source: string): string[] =>
  [...stripComments(source).matchAll(STORAGE_GLOBAL)].map((match) => match[0])

const fakeServerImportViolations = (relativePath: string, source: string): string[] => {
  if (relativePath.endsWith('.test.ts')) {
    return []
  }
  return [...stripComments(source).matchAll(IMPORT_SPECIFIER)]
    .map((match) => match[1] ?? '')
    .filter((specifier) => /(?:^|\/)fake-orcad-server$/.test(specifier))
}

type SourceFile = { relativePath: string; source: string }

// Excludes itself: its own seeded-violation self-tests below embed every forbidden
// pattern as string literals, which would otherwise flag this file against its own rules.
const RATCHET_FILE_NAME = path.basename(fileURLToPath(import.meta.url))

const sourcesIn = (dir: string, baseDir: string): SourceFile[] =>
  readdirSync(dir)
    .filter((name) => name.endsWith('.ts') && name !== RATCHET_FILE_NAME)
    .map((name) => ({
      relativePath: path.relative(baseDir, path.join(dir, name)),
      source: readFileSync(path.join(dir, name), 'utf8')
    }))

const rpcSources = sourcesIn(RPC_DIR, FRONTEND_SRC_DIR)
const rpcProductionSources = rpcSources.filter((file) => !file.relativePath.endsWith('.test.ts'))

describe('rpc purity ratchet — the checks themselves', () => {
  it('catches an import that reaches src/shared, with or without escaping the root', () => {
    expect(importViolations("import { x } from '../../../../src/shared/e2ee-crypto'")).toEqual([
      '../../../../src/shared/e2ee-crypto'
    ])
    expect(importViolations("import { y } from '../../src/shared/pairing'")).toEqual(['../../src/shared/pairing'])
  })

  it('catches an import that escapes the frontend package root regardless of target', () => {
    expect(importViolations("import { z } from '../../../../some-other-package/thing'")).toEqual([
      '../../../../some-other-package/thing'
    ])
  })

  it('allows relative imports within frontend/, bare package specifiers, and node: builtins', () => {
    expect(
      importViolations(
        "import nacl from 'tweetnacl'\nimport { seal } from './e2ee-box'\nimport type { RuntimeGateway } from '../../application/ports/runtime-gateway'\nimport { createServer } from 'node:http'"
      )
    ).toEqual([])
  })

  it('ignores an import specifier that only appears in a comment', () => {
    expect(importViolations("// see ../../../../src/shared/e2ee-crypto for the original\nconst x = 1")).toEqual([])
  })

  it('catches a seeded storage-global reference in any of the four forms', () => {
    expect(globalReferenceViolations("localStorage.getItem('x')")).toEqual(['localStorage'])
    expect(globalReferenceViolations('sessionStorage.setItem("a", "b")')).toEqual(['sessionStorage'])
    expect(globalReferenceViolations('indexedDB.open("db")')).toEqual(['indexedDB'])
    expect(globalReferenceViolations('document.cookie = "a=b"')).toEqual(['document.cookie'])
  })

  it('ignores a storage-global reference that only appears in a comment', () => {
    expect(globalReferenceViolations('// keys are memory-only, never localStorage\nconst x = 1')).toEqual([])
  })

  it('catches a production import of fake-orcad-server but allows a test import', () => {
    expect(fakeServerImportViolations('paired-websocket-transport.ts', "import { startFakeOrcadServer } from './fake-orcad-server'")).toEqual(
      ['./fake-orcad-server']
    )
    expect(
      fakeServerImportViolations(
        'paired-websocket-transport.test.ts',
        "import { startFakeOrcadServer } from './fake-orcad-server'"
      )
    ).toEqual([])
  })
})

describe('rpc purity ratchet — the real sources', () => {
  it('finds files to check', () => {
    expect(rpcSources.length).toBeGreaterThan(0)
    expect(rpcProductionSources.length).toBeGreaterThan(0)
  })

  it.each(rpcSources)('$relativePath imports no src/shared module and escapes no root', ({ source }) => {
    expect(importViolations(source)).toEqual([])
  })

  it.each(rpcSources)('$relativePath references no storage global', ({ source }) => {
    expect(globalReferenceViolations(source)).toEqual([])
  })

  it.each(rpcProductionSources)('$relativePath does not import fake-orcad-server outside a test file', ({
    relativePath,
    source
  }) => {
    expect(fakeServerImportViolations(relativePath, source)).toEqual([])
  })
})
