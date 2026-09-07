import type { CompareRailRow } from './compare-rail-model'

const EMPTY_TEXT = 'sin litter'

const buildRow = (
  doc: Document,
  row: CompareRailRow,
  onFocus: (childId: string) => void,
  onSetWinner: (childId: string | null) => void
): HTMLElement => {
  const rowElement = doc.createElement('div')
  rowElement.className = row.cssClass

  const label = doc.createElement('span')
  label.className = 'compare-rail__label'
  label.textContent = row.label

  const stat = doc.createElement('span')
  stat.className = 'compare-rail__stat'
  stat.textContent = row.statText

  const winnerToggle = doc.createElement('button')
  winnerToggle.type = 'button'
  winnerToggle.className = 'compare-rail__winner-toggle'
  winnerToggle.textContent = row.winnerToggleLabel
  winnerToggle.addEventListener('click', (event) => {
    event.stopPropagation() // the winner button lives inside the focus-on-click row
    onSetWinner(row.isWinner ? null : row.childId)
  })

  rowElement.appendChild(label)
  rowElement.appendChild(stat)
  rowElement.appendChild(winnerToggle)
  rowElement.addEventListener('click', () => onFocus(row.childId))
  return rowElement
}

export type CompareRailHandle = {
  readonly root: HTMLElement
  apply(rows: readonly CompareRailRow[]): void
  onFocusChild(cb: (childId: string) => void): void
  onSetWinner(cb: (childId: string | null) => void): void
  dispose(): void
}

/**
 * Compare mode's child rail (left column) — mirrors diff-rail-element.ts's rebuild-on-apply
 * pattern. A row click focuses that child (drives the middle file-rail); the winner-toggle
 * button records/clears the winner (record-only — no merge action exists here).
 */
export function createCompareRail(doc: Document = document): CompareRailHandle {
  const root = doc.createElement('div')
  root.className = 'cubito-compare-rail'

  let focusCallback: ((childId: string) => void) | null = null
  let winnerCallback: ((childId: string | null) => void) | null = null

  return {
    root,
    apply(rows: readonly CompareRailRow[]) {
      root.replaceChildren()
      if (rows.length === 0) {
        const empty = doc.createElement('div')
        empty.className = 'cubito-compare-rail__empty'
        empty.textContent = EMPTY_TEXT
        root.appendChild(empty)
        return
      }
      for (const row of rows) {
        root.appendChild(
          buildRow(
            doc,
            row,
            (childId) => focusCallback?.(childId),
            (childId) => winnerCallback?.(childId)
          )
        )
      }
    },
    onFocusChild(cb) {
      focusCallback = cb
    },
    onSetWinner(cb) {
      winnerCallback = cb
    },
    dispose() {
      root.remove()
    }
  }
}
