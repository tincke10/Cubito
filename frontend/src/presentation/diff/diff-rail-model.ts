import type { DiffFileRow } from '../../application/diff-view-model'

export type DiffRailRow = {
  path: string
  status: string
  addedText: string
  removedText: string
  cssClass: string
  selected: boolean
}

const MINUS_GLYPH = '−'

const railCssClass = (status: string, selected: boolean): string =>
  `diff-rail__row diff-rail__row--${status}${selected ? ' diff-rail__row--selected' : ''}`

/** Pure projection of the diff rail's file list, selection-aware. No DOM. */
export function diffRailViewModel(
  files: readonly DiffFileRow[],
  selectedPath: string | null
): readonly DiffRailRow[] {
  return files.map((file) => {
    const selected = file.path === selectedPath
    return {
      path: file.path,
      status: file.status,
      addedText: `+${file.added}`,
      removedText: `${MINUS_GLYPH}${file.removed}`,
      cssClass: railCssClass(file.status, selected),
      selected
    }
  })
}
