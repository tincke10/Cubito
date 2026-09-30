import { describe, expect, it } from 'vitest'
import { createDemoBanner, demoBannerText } from './demo-banner-element'

describe('demoBannerText', () => {
  it('is loud about sample data and carries the reason', () => {
    const text = demoBannerText('código de pairing inválido')
    expect(text).toContain('MODO DEMO')
    expect(text).toContain('datos de ejemplo')
    expect(text).toContain('código de pairing inválido')
  })
})

describe('createDemoBanner', () => {
  it('builds an inert alert element with the banner text', () => {
    const attributes: Record<string, string> = {}
    const element = {
      className: '',
      textContent: '',
      style: {} as Record<string, string>,
      setAttribute: (name: string, value: string) => void (attributes[name] = value)
    }
    const doc = { createElement: () => element } as unknown as Document
    const banner = createDemoBanner(doc, 'modo demo')
    expect(banner).toBe(element)
    expect(element.className).toBe('cubito-demo-banner')
    expect(element.textContent).toBe(demoBannerText('modo demo'))
    expect(attributes.role).toBe('alert')
  })
})
