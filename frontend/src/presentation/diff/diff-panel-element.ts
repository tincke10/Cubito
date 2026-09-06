import type { DiffPanelLineView, DiffPanelView } from './diff-panel-model'

const LOADING_TEXT = 'cargando…'
const IDLE_TEXT = 'elegí un archivo'
const BINARY_TEXT = 'archivo binario · sin vista de diff'
const DELETED_TEXT = 'eliminado'
const TRUNCATED_TEXT = 'diff recortado (límite de contenido)'
const ERROR_FALLBACK_TEXT = 'error al cargar el diff'

const buildLineRow = (doc: Document, line: DiffPanelLineView): HTMLElement => {
  const row = doc.createElement('div')
  row.className = line.cssClass

  const oldNo = doc.createElement('span')
  oldNo.className = 'diff-panel__gutter diff-panel__gutter--old'
  oldNo.textContent = line.oldNo === null ? '' : String(line.oldNo)

  const newNo = doc.createElement('span')
  newNo.className = 'diff-panel__gutter diff-panel__gutter--new'
  newNo.textContent = line.newNo === null ? '' : String(line.newNo)

  const text = doc.createElement('span')
  text.className = 'diff-panel__text'
  text.textContent = line.text

  row.appendChild(oldNo)
  row.appendChild(newNo)
  row.appendChild(text)
  return row
}

const buildHint = (doc: Document, cssClass: string, text: string): HTMLElement => {
  const hint = doc.createElement('div')
  hint.className = cssClass
  hint.textContent = text
  return hint
}

export type DiffPanelHandle = {
  readonly element: HTMLElement
  apply(vm: DiffPanelView): void
  dispose(): void
}

/**
 * Diff mode's right panel (unified line diff) — mirrors activity-feed-element.ts's
 * rebuild-on-apply pattern. Per-line cssClass comes straight from diffPanelViewModel.
 */
export function createDiffPanel(doc: Document = document): DiffPanelHandle {
  const element = doc.createElement('div')
  element.className = 'cubito-diff-panel'

  return {
    element,
    apply(vm: DiffPanelView) {
      element.replaceChildren()
      switch (vm.kind) {
        case 'lines': {
          const lines = doc.createElement('div')
          lines.className = 'cubito-diff-panel__lines'
          for (const line of vm.lines) lines.appendChild(buildLineRow(doc, line))
          element.appendChild(lines)
          if (vm.truncated) {
            element.appendChild(buildHint(doc, 'cubito-diff-panel__truncated', TRUNCATED_TEXT))
          }
          break
        }
        case 'binary':
          element.appendChild(
            buildHint(
              doc,
              'cubito-diff-panel__binary',
              vm.deleted ? `${BINARY_TEXT} · ${DELETED_TEXT}` : BINARY_TEXT
            )
          )
          break
        case 'loading':
          element.appendChild(buildHint(doc, 'cubito-diff-panel__loading', LOADING_TEXT))
          break
        case 'idle':
          element.appendChild(buildHint(doc, 'cubito-diff-panel__idle', IDLE_TEXT))
          break
        case 'error':
          element.appendChild(
            buildHint(doc, 'cubito-diff-panel__error', vm.message ?? ERROR_FALLBACK_TEXT)
          )
          break
      }
    },
    dispose() {
      element.remove()
    }
  }
}
