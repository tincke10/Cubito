import type { CommandId } from '../../application/command-catalog'
import type { CommandPaletteRow, CommandPaletteViewModel } from './command-palette-view-model'

/** ↑↓/Tab cycle the highlight, Enter activates it, Escape closes. */
export type CommandPaletteKeyAction =
  | { type: 'highlight'; delta: number }
  | { type: 'activate' }
  | { type: 'close' }

/** Pure key resolver (mirrors resolveProjectSelectorKey) — the element's own keydown never
 *  competes with the global keyboard-controller because the query input is a text-entry target. */
export function resolveCommandPaletteKey(key: string): CommandPaletteKeyAction | null {
  if (key === 'ArrowDown' || key === 'Tab') return { type: 'highlight', delta: 1 }
  if (key === 'ArrowUp') return { type: 'highlight', delta: -1 }
  if (key === 'Enter') return { type: 'activate' }
  if (key === 'Escape') return { type: 'close' }
  return null
}

export type CommandPaletteHandle = {
  readonly element: HTMLElement
  apply(model: CommandPaletteViewModel): void
  onQueryChange(callback: (query: string) => void): () => void
  onHighlight(callback: (delta: number) => void): () => void
  onActivate(callback: (id: CommandId) => void): () => void
  onClose(callback: () => void): () => void
  focusQuery(): void
  dispose(): void
}

/**
 * ⌘K palette panel — a fixed HUD `<div>` built like project-selector-element.ts, with an
 * injectable `doc`. Adds a dimmed backdrop (the one structural addition over the selector, per
 * the mockup) behind a centered panel: query input + command rows + a static footer hint line.
 * Owns its own keydown so Escape/Enter/↑↓/Tab never compete with the graph's keyboard-controller
 * while the query input is focused.
 */
export function createCommandPalette(doc: Document = document): CommandPaletteHandle {
  const root = doc.createElement('div')
  root.className = 'cubito-command-palette'
  root.style.pointerEvents = 'auto'

  const backdrop = doc.createElement('div')
  backdrop.className = 'cubito-command-palette__backdrop'

  const panel = doc.createElement('div')
  panel.className = 'cubito-command-palette__panel'

  const header = doc.createElement('div')
  header.className = 'cubito-command-palette__header'

  const prompt = doc.createElement('span')
  prompt.className = 'cubito-command-palette__prompt'
  prompt.textContent = '›'

  const queryInput = doc.createElement('input')
  queryInput.className = 'cubito-command-palette__query'
  ;(queryInput as unknown as HTMLInputElement).placeholder = 'escribí un comando…'

  header.appendChild(prompt)
  header.appendChild(queryInput)

  const rows = doc.createElement('div')
  rows.className = 'cubito-command-palette__rows'

  const footer = doc.createElement('div')
  footer.className = 'cubito-command-palette__footer'
  footer.textContent = '↑↓ navegar · ⏎ ejecutar · esc cerrar'

  panel.appendChild(header)
  panel.appendChild(rows)
  panel.appendChild(footer)

  root.appendChild(backdrop)
  root.appendChild(panel)

  let queryChangeCallback: ((query: string) => void) | null = null
  let highlightCallback: ((delta: number) => void) | null = null
  let activateCallback: ((id: CommandId) => void) | null = null
  let closeCallback: (() => void) | null = null
  let currentRows: readonly CommandPaletteRow[] = []

  queryInput.addEventListener('input', () => {
    queryChangeCallback?.((queryInput as unknown as { value: string }).value)
  })

  backdrop.addEventListener('click', () => closeCallback?.())

  const activateHighlighted = (): void => {
    const highlighted = currentRows.find((row) => row.highlighted)
    if (highlighted?.available) activateCallback?.(highlighted.id)
  }

  root.addEventListener('keydown', (event) => {
    const action = resolveCommandPaletteKey((event as KeyboardEvent).key)
    if (!action) return
    if ((event as KeyboardEvent).key === 'Tab') (event as KeyboardEvent).preventDefault()
    switch (action.type) {
      case 'highlight':
        highlightCallback?.(action.delta)
        break
      case 'activate':
        activateHighlighted()
        break
      case 'close':
        closeCallback?.()
        break
    }
  })

  return {
    element: root,
    apply(model) {
      if (model === null) return
      queryInput.value = model.query
      currentRows = model.rows
      rows.replaceChildren()
      for (const row of model.rows) {
        const rowElement = doc.createElement('div')
        rowElement.className = [
          'cubito-command-palette__row',
          row.highlighted ? 'cubito-command-palette__row--highlighted' : '',
          row.available ? '' : 'cubito-command-palette__row--disabled'
        ]
          .filter(Boolean)
          .join(' ')

        const label = doc.createElement('span')
        label.className = 'cubito-command-palette__label'
        label.textContent = row.label

        const keycap = doc.createElement('span')
        keycap.className = 'cubito-command-palette__keycap'
        keycap.textContent = row.keybindingHint

        rowElement.appendChild(label)
        rowElement.appendChild(keycap)
        rowElement.addEventListener('click', () => {
          if (row.available) activateCallback?.(row.id)
        })
        rows.appendChild(rowElement)
      }
    },
    onQueryChange(callback) {
      queryChangeCallback = callback
      return () => (queryChangeCallback = null)
    },
    onHighlight(callback) {
      highlightCallback = callback
      return () => (highlightCallback = null)
    },
    onActivate(callback) {
      activateCallback = callback
      return () => (activateCallback = null)
    },
    onClose(callback) {
      closeCallback = callback
      return () => (closeCallback = null)
    },
    focusQuery() {
      queryInput.focus()
    },
    dispose() {
      root.remove()
    }
  }
}
