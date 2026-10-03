import type { Language } from './language'

export const LANGUAGE_STORAGE_KEY = 'cubito.language'

export type LanguageStorage = {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

/** localStorage can throw or be absent (private mode, blocked site data, node tests). */
export const tryGetLocalStorage = (): LanguageStorage | undefined => {
  try {
    return globalThis.localStorage
  } catch {
    return undefined
  }
}

export function readStoredLanguage(storage: LanguageStorage | undefined): string | null {
  try {
    return storage?.getItem(LANGUAGE_STORAGE_KEY) ?? null
  } catch {
    return null
  }
}

export function writeStoredLanguage(
  storage: LanguageStorage | undefined,
  language: Language
): void {
  try {
    storage?.setItem(LANGUAGE_STORAGE_KEY, language)
  } catch {
    // Why: a blocked store only costs persistence; the reload still applies the choice for now.
  }
}

/** Persists the choice and reloads: most HUD elements are built once with their copy, so a
 *  reload is the one switch path that cannot leave a mixed-language UI. */
export function switchLanguage(
  language: Language,
  env: { storage: LanguageStorage | undefined; reload(): void } = {
    storage: tryGetLocalStorage(),
    reload: () => globalThis.location.reload()
  }
): void {
  writeStoredLanguage(env.storage, language)
  env.reload()
}
