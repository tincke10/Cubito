import { describe, expect, it } from 'vitest'
import { en } from './en'
import { es } from './es'

const placeholders = (message: string): Set<string> =>
  new Set([...message.matchAll(/\{(\w+)\}/g)].map((match) => match[1]!))

describe('dictionaries', () => {
  it('es has exactly the keys of en', () => {
    expect(new Set(Object.keys(es))).toEqual(new Set(Object.keys(en)))
  })

  it('every message is non-empty', () => {
    for (const [key, value] of [...Object.entries(en), ...Object.entries(es)]) {
      expect(value, key).not.toBe('')
    }
  })

  it('es keeps the same {placeholders} as en for every key', () => {
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      expect(placeholders(es[key]), key).toEqual(placeholders(en[key]))
    }
  })
})
