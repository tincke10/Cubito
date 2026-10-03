import { afterEach, describe, expect, it } from 'vitest'
import { activeLanguage, interpolate, setActiveLanguage, t, tn } from './translate'

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

describe('tn', () => {
  it('picks the .one or .other message by the active language plural rule and injects {count}', () => {
    setActiveLanguage('es')
    expect(tn('hud.activeAgents', 1)).toBe('1 agente activo')
    expect(tn('hud.activeAgents', 0)).toBe('0 agentes activos')
    expect(tn('hud.activeAgents', 3)).toBe('3 agentes activos')
    setActiveLanguage('en')
    expect(tn('hud.activeAgents', 1)).toBe('1 active agent')
    expect(tn('hud.activeAgents', 2)).toBe('2 active agents')
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
