import type { DiffRailRow } from './diff-rail-model'

const EMPTY_TEXT = 'sin cambios'

const buildRow = (
  doc: Document,
  row: DiffRailRow,
  onClick: (path: string) => void
): HTMLElement => {
  const rowElement = doc.createElement('div')
  rowElement.className = row.cssClass

  const path = doc.createElement('span')
  path.className = 'diff-rail__path'
  path.textContent = row.path

  const added = doc.createElement('span')
  added.className = 'diff-rail__added'
  added.textContent = row.addedText

  const removed = doc.createElement('span')
  removed.className = 'diff-rail__removed'
  removed.textContent = row.removedText

  rowElement.appendChild(path)
  rowElement.appendChild(added)
  rowElement.appendChild(removed)
  rowElement.addEventListener('click', () => onClick(row.path))
  return rowElement
}

export type DiffRailHandle = {
  readonly root: HTMLElement
  apply(rows: readonly DiffRailRow[]): void
  onSelect(cb: (path: string) => void): void
  dispose(): void
}

/**
 * Diff mode's left rail (file list) — mirrors activity-feed-element.ts's rebuild-on-apply
 * pattern. Row cssClass comes straight from diffRailViewModel, applied verbatim (already
 * encodes status + selected). Empty rows -> an empty-state placeholder, no row list.
 */
export function createDiffRail(doc: Document = document): DiffRailHandle {
  const root = doc.createElement('div')
  root.className = 'cubito-diff-rail'

  let selectCallback: ((path: string) => void) | null = null

  return {
    root,
    apply(rows: readonly DiffRailRow[]) {
      root.replaceChildren()
      if (rows.length === 0) {
        const empty = doc.createElement('div')
        empty.className = 'cubito-diff-rail__empty'
        empty.textContent = EMPTY_TEXT
        root.appendChild(empty)
        return
      }
      for (const row of rows) {
        root.appendChild(buildRow(doc, row, (path) => selectCallback?.(path)))
      }
    },
    onSelect(cb) {
      selectCallback = cb
    },
    dispose() {
      root.remove()
    }
  }
}
