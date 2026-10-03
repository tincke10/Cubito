import { describe, expect, it } from 'vitest'
import { isLanguage, resolveLanguage } from './language'

describe('isLanguage', () => {
  it('accepts only supported codes', () => {
    expect(isLanguage('en')).toBe(true)
    expect(isLanguage('es')).toBe(true)
    expect(isLanguage('es-AR')).toBe(false)
    expect(isLanguage(null)).toBe(false)
  })
})

describe('resolveLanguage', () => {
  it('prefers the stored choice over the browser languages', () => {
    expect(resolveLanguage({ stored: 'en', preferred: ['es-AR'] })).toBe('en')
    expect(resolveLanguage({ stored: 'es', preferred: ['en-US'] })).toBe('es')
  })

  it('ignores an unsupported stored value', () => {
    expect(resolveLanguage({ stored: 'fr', preferred: ['es'] })).toBe('es')
  })

  it('picks es when the first es* browser language is present, case-insensitively', () => {
    expect(resolveLanguage({ stored: null, preferred: ['es-UY', 'en'] })).toBe('es')
    expect(resolveLanguage({ stored: null, preferred: ['ES'] })).toBe('es')
  })

  it('honours browser preference order: an earlier en wins over a later es', () => {
    expect(resolveLanguage({ stored: null, preferred: ['en-US', 'es'] })).toBe('en')
  })

  it('defaults to en', () => {
    expect(resolveLanguage({ stored: null, preferred: [] })).toBe('en')
    expect(resolveLanguage({ stored: null, preferred: ['fr', 'de'] })).toBe('en')
  })
})
