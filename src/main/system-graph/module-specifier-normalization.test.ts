import { describe, expect, it } from 'vitest'
import { moduleFileCandidates, stripModuleExtension } from './module-specifier-normalization'

describe('stripModuleExtension', () => {
  it.each(['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs'])(
    'strips a trailing %s',
    (ext) => {
      expect(stripModuleExtension(`./services/book-service${ext}`)).toBe('./services/book-service')
    }
  )

  it('keeps dots that are not a module extension', () => {
    expect(stripModuleExtension('./book.service.ts')).toBe('./book.service')
    expect(stripModuleExtension('./book.service')).toBe('./book.service')
  })

  it('leaves a specifier without an extension unchanged', () => {
    expect(stripModuleExtension('./services/book-service')).toBe('./services/book-service')
  })
})

describe('moduleFileCandidates', () => {
  it('tries the exact path first', () => {
    expect(moduleFileCandidates('src/a.ts')[0]).toBe('src/a.ts')
  })

  it.each([
    ['src/a.js', 'src/a.ts'],
    ['src/a.js', 'src/a.tsx'],
    ['src/a.jsx', 'src/a.tsx'],
    ['src/a.mjs', 'src/a.mts'],
    ['src/a.cjs', 'src/a.cts']
  ])('maps %s to its TS source %s', (spec, source) => {
    expect(moduleFileCandidates(spec)).toContain(source)
  })

  it('ranks the TS source mapping ahead of appended extensions', () => {
    const candidates = moduleFileCandidates('src/a.js')
    expect(candidates.indexOf('src/a.ts')).toBeLessThan(candidates.indexOf('src/a.js.ts'))
  })

  it('appends extensionless candidates, including the ESM/CJS variants', () => {
    const candidates = moduleFileCandidates('src/a')
    for (const ext of ['.ts', '.tsx', '.mts', '.cts', '.js', '.mjs', '.cjs']) {
      expect(candidates).toContain(`src/a${ext}`)
    }
  })

  it('falls back to directory index files', () => {
    const candidates = moduleFileCandidates('src/routes')
    expect(candidates).toContain('src/routes/index.ts')
    expect(candidates).toContain('src/routes/index.tsx')
    expect(candidates).toContain('src/routes/index.mjs')
  })

  it('maps a /index.js specifier to index.ts and strips a trailing slash', () => {
    expect(moduleFileCandidates('src/routes/index.js')).toContain('src/routes/index.ts')
    expect(moduleFileCandidates('src/routes/')).toContain('src/routes/index.ts')
  })
})
