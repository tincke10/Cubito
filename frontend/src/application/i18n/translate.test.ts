import { afterEach, describe, expect, it } from 'vitest'
import { activeLanguage, interpolate, setActiveLanguage, t } from './translate'

afterEach(() => setActiveLanguage('es'))

describe('interpolate', () => {
  it('replaces {name} placeholders, repeated ones included', () => {
    expect(interpolate('{a} y {b} y {a}', { a: 'x', b: 2 })).toBe('x y 2 y x')
  })

  it('leaves unknown placeholders untouched', () => {
    expect(interpolate('hola {who}', {})).toBe('hola {who}')
    expect(interpolate('hola {who}')).toBe('hola {who}')
  })
})

describe('t', () => {
  it('follows the active language', () => {
    setActiveLanguage('en')
    expect(t('palette.switchLanguage')).toBe('Idioma: Español')
    setActiveLanguage('es')
    expect(t('palette.switchLanguage')).toBe('Language: English')
  })
})

describe('setActiveLanguage', () => {
  it('updates activeLanguage and document.documentElement.lang when a document exists', () => {
    const documentElement = { lang: 'es' }
    const original = Object.getOwnPropertyDescriptor(globalThis, 'document')
    Object.defineProperty(globalThis, 'document', {
      value: { documentElement },
      configurable: true
    })
    try {
      setActiveLanguage('en')
      expect(activeLanguage()).toBe('en')
      expect(documentElement.lang).toBe('en')
    } finally {
      if (original) Object.defineProperty(globalThis, 'document', original)
      else Reflect.deleteProperty(globalThis, 'document')
    }
  })
})
