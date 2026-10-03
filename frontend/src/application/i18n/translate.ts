import { resolveLanguage } from './language'
import type { Language } from './language'
import { readStoredLanguage, tryGetLocalStorage } from './language-preference'
import { en } from './messages/en'
import type { MessageKey } from './messages/en'
import { es } from './messages/es'

export type MessageParams = Readonly<Record<string, string | number>>

const dictionaries: Record<Language, Record<MessageKey, string>> = { en, es }

let active: Language | null = null

const environmentLanguage = (): Language =>
  resolveLanguage({
    stored: readStoredLanguage(tryGetLocalStorage()),
    preferred: globalThis.navigator?.languages ?? []
  })

/** Resolved lazily on first use so module-level `t()` callers see storage/navigator, not a default. */
export function activeLanguage(): Language {
  active ??= environmentLanguage()
  return active
}

export function setActiveLanguage(language: Language): void {
  active = language
  if (typeof document !== 'undefined') document.documentElement.lang = language
}

export const interpolate = (template: string, params?: MessageParams): string =>
  params === undefined
    ? template
    : template.replace(/\{(\w+)\}/g, (placeholder, name: string) =>
        name in params ? String(params[name]) : placeholder
      )

export function t(key: MessageKey, params?: MessageParams): string {
  return interpolate(dictionaries[activeLanguage()][key], params)
}
