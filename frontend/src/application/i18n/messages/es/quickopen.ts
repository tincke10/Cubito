import type { enQuickopen } from '../en/quickopen'

export const esQuickopen: Record<keyof typeof enQuickopen, string> = {
  'quickopen.placeholder': 'abrir archivo…',
  'quickopen.searching': 'buscando…',
  'quickopen.hint': 'escribe parte del nombre o de la ruta',
  'quickopen.noResults': 'sin resultados',
  'quickopen.binaryName': '{name} (binario)',
  'quickopen.searchFailed': 'búsqueda fallida: {reason}'
}
