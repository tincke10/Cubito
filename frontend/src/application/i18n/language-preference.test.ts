import { describe, expect, it, vi } from 'vitest'
import {
  LANGUAGE_STORAGE_KEY,
  readStoredLanguage,
  switchLanguage,
  writeStoredLanguage
} from './language-preference'

const memoryStorage = (initial: Record<string, string> = {}) => {
  const data = new Map(Object.entries(initial))
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value)
  }
}

const throwingStorage = {
  getItem: () => {
    throw new Error('blocked')
  },
  setItem: () => {
    throw new Error('blocked')
  }
}

describe('readStoredLanguage', () => {
  it('returns the stored raw value, or null when absent', () => {
    expect(readStoredLanguage(memoryStorage({ [LANGUAGE_STORAGE_KEY]: 'es' }))).toBe('es')
    expect(readStoredLanguage(memoryStorage())).toBeNull()
  })

  it('returns null when storage is unavailable or throws', () => {
    expect(readStoredLanguage(undefined)).toBeNull()
    expect(readStoredLanguage(throwingStorage)).toBeNull()
  })
})

describe('writeStoredLanguage', () => {
  it('persists the choice under the storage key', () => {
    const storage = memoryStorage()
    writeStoredLanguage(storage, 'es')
    expect(storage.getItem(LANGUAGE_STORAGE_KEY)).toBe('es')
  })

  it('swallows storage failures', () => {
    expect(() => writeStoredLanguage(throwingStorage, 'en')).not.toThrow()
    expect(() => writeStoredLanguage(undefined, 'en')).not.toThrow()
  })
})

describe('switchLanguage', () => {
  it('persists then reloads so every statically-built element picks the new language', () => {
    const storage = memoryStorage()
    const reload = vi.fn()
    switchLanguage('es', { storage, reload })
    expect(storage.getItem(LANGUAGE_STORAGE_KEY)).toBe('es')
    expect(reload).toHaveBeenCalledOnce()
  })

  it('still reloads when storage is blocked', () => {
    const reload = vi.fn()
    switchLanguage('en', { storage: throwingStorage, reload })
    expect(reload).toHaveBeenCalledOnce()
  })
})
