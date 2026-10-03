export type Language = 'en' | 'es'

export const DEFAULT_LANGUAGE: Language = 'en'

export const isLanguage = (value: unknown): value is Language => value === 'en' || value === 'es'

/** Stored choice > first browser language we support (es* → es) > English. */
export function resolveLanguage(input: {
  stored: string | null
  preferred: readonly string[]
}): Language {
  if (isLanguage(input.stored)) return input.stored
  for (const tag of input.preferred) {
    const primary = tag.toLowerCase().split('-')[0]
    if (primary === 'es') return 'es'
    if (primary === 'en') return 'en'
  }
  return DEFAULT_LANGUAGE
}
