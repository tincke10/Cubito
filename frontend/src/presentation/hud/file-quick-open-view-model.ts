import type { FileQuickOpenView } from '../../application/file-quick-open-flow'
import { t } from '../../application/i18n/translate'

export type FileQuickOpenRow = {
  path: string
  name: string
  folder: string
  binary: boolean
  highlighted: boolean
}

export type FileQuickOpenPanelModel = {
  visible: boolean
  query: string
  rows: readonly FileQuickOpenRow[]
  /** Hint/progress line shown under the input; null once there are rows to look at. */
  statusText: string | null
  error: string | null
}

const HIDDEN: FileQuickOpenPanelModel = {
  visible: false,
  query: '',
  rows: [],
  statusText: null,
  error: null
}

function statusTextOf(view: Extract<FileQuickOpenView, { phase: 'open' }>): string | null {
  if (view.error !== null || view.rows.length > 0) return null
  if (view.searching) return t('quickopen.searching')
  return view.query.trim() === '' ? t('quickopen.hint') : t('quickopen.noResults')
}

/** Pure projection of the quick-open flow into panel copy (localized via t()). */
export function fileQuickOpenPanelModel(view: FileQuickOpenView): FileQuickOpenPanelModel {
  if (view.phase === 'closed') return HIDDEN
  return {
    visible: true,
    query: view.query,
    rows: view.rows.map((row, index) => ({
      path: row.relativePath,
      name: row.basename,
      folder: row.relativePath.includes('/')
        ? row.relativePath.slice(0, row.relativePath.lastIndexOf('/'))
        : '',
      binary: row.binary,
      highlighted: index === view.highlighted
    })),
    statusText: statusTextOf(view),
    error: view.error
  }
}
