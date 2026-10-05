import { resolveProjectSelectorKey } from './project-selector-element'
import type { FileQuickOpenPanelModel } from './file-quick-open-view-model'
import { t } from '../../application/i18n/translate'
import { renderFailureText } from '../failure-text-element'

export type FileQuickOpenHandle = {
  readonly root: HTMLElement
  apply(model: FileQuickOpenPanelModel): void
  onQueryChange(cb: (query: string) => void): void
  onHighlight(cb: (delta: number) => void): void
  /** `null` = the highlighted row (Enter); a number = a clicked row. */
  onActivate(cb: (index: number | null) => void): void
  onClose(cb: () => void): void
  focusQuery(): void
  dispose(): void
}

/**
 * Fuzzy path picker, built like the project selector: it owns its keydown, so ↑↓/Tab/Enter/Esc
 * reach it (the input is a text-entry target) and never the graph's keyboard controller.
 */
export function createFileQuickOpen(doc: Document = document): FileQuickOpenHandle {
  const root = doc.createElement('div')
  root.className = 'cubito-file-quick-open'
  const backdrop = doc.createElement('div')
  backdrop.className = 'cubito-file-quick-open__backdrop'
  const card = doc.createElement('div')
  card.className = 'cubito-file-quick-open__card'
  const query = doc.createElement('input')
  query.className = 'cubito-file-quick-open__query'
  query.placeholder = t('quickopen.placeholder')
  const status = doc.createElement('div')
  status.className = 'cubito-file-quick-open__status'
  const rows = doc.createElement('div')
  rows.className = 'cubito-file-quick-open__rows'
  card.appendChild(query)
  card.appendChild(status)
  card.appendChild(rows)
  root.appendChild(backdrop)
  root.appendChild(card)

  let queryCallback: ((value: string) => void) | null = null
  let highlightCallback: ((delta: number) => void) | null = null
  let activateCallback: ((index: number | null) => void) | null = null
  let closeCallback: (() => void) | null = null

  query.addEventListener('input', () => queryCallback?.(query.value))
  backdrop.addEventListener('click', () => closeCallback?.())
  root.addEventListener('keydown', (event) => {
    const action = resolveProjectSelectorKey('list', event.key)
    if (!action) return
    // Why: Tab would otherwise move focus out of the picker.
    event.preventDefault()
    if (action.type === 'highlight') highlightCallback?.(action.delta)
    else if (action.type === 'activate') activateCallback?.(null)
    else if (action.type === 'close') closeCallback?.()
  })

  return {
    root,
    apply(model) {
      root.hidden = !model.visible
      if (query.value !== model.query) query.value = model.query
      renderFailureText(doc, status, model.error ?? model.statusText ?? '')
      status.classList.toggle('cubito-file-quick-open__status--error', model.error !== null)
      status.hidden = model.error === null && model.statusText === null
      rows.replaceChildren()
      model.rows.forEach((row, index) => {
        const element = doc.createElement('div')
        element.className = [
          'cubito-file-quick-open__row',
          row.highlighted ? 'cubito-file-quick-open__row--highlighted' : ''
        ]
          .filter(Boolean)
          .join(' ')
        const name = doc.createElement('span')
        name.className = 'cubito-file-quick-open__name'
        name.textContent = row.binary ? t('quickopen.binaryName', { name: row.name }) : row.name
        const folder = doc.createElement('span')
        folder.className = 'cubito-file-quick-open__folder'
        folder.textContent = row.folder
        element.appendChild(name)
        element.appendChild(folder)
        element.addEventListener('click', () => activateCallback?.(index))
        rows.appendChild(element)
        if (row.highlighted) element.scrollIntoView?.({ block: 'nearest' })
      })
    },
    onQueryChange: (cb) => (queryCallback = cb),
    onHighlight: (cb) => (highlightCallback = cb),
    onActivate: (cb) => (activateCallback = cb),
    onClose: (cb) => (closeCallback = cb),
    focusQuery: () => query.focus(),
    dispose: () => root.remove()
  }
}
