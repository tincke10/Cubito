import { setActiveLanguage } from './src/application/i18n/translate'

// Why: existing assertions are written against the Spanish copy; 'en' tests opt in per-case.
setActiveLanguage('es')
