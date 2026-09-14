import type { DiffFileRow } from '../../application/diff-view-model'

export type DiffRailRow = {
  path: string
  status: string
  addedText: string
  removedText: string
  cssClass: string
  selected: boolean
  /** Rename hint, e.g. "a.ts →" — set only when the file has an oldPath. */
  oldPathText?: string
  /** "naciendo"/"sin commitear" badge — set only when the row has a working-tree component. */
  originText?: string
}

const MINUS_GLYPH = '−'
/** Statuses git.status reports for a brand-new path (mirrors system-graph-file-diff.ts). */
const NACIENDO_STATUSES = new Set(['untracked', 'added', 'copied'])
const HAS_WORKING_COMPONENT = new Set(['working', 'both'])

const railCssClass = (status: string, selected: boolean, hasWorkingComponent: boolean): string =>
  `diff-rail__row diff-rail__row--${status}${hasWorkingComponent ? ' diff-rail__row--wt' : ''}${selected ? ' diff-rail__row--selected' : ''}`

const originTextFor = (file: DiffFileRow): string | undefined =>
  file.origin !== undefined && HAS_WORKING_COMPONENT.has(file.origin)
    ? NACIENDO_STATUSES.has(file.status)
      ? 'naciendo'
      : 'sin commitear'
    : undefined

/** Pure projection of the diff rail's file list, selection-aware. No DOM. */
export function diffRailViewModel(
  files: readonly DiffFileRow[],
  selectedPath: string | null
): readonly DiffRailRow[] {
  return files.map((file) => {
    const selected = file.path === selectedPath
    const originText = originTextFor(file)
    return {
      path: file.path,
      status: file.status,
      addedText: `+${file.added}`,
      removedText: `${MINUS_GLYPH}${file.removed}`,
      cssClass: railCssClass(file.status, selected, originText !== undefined),
      selected,
      ...(file.oldPath === undefined ? {} : { oldPathText: `${file.oldPath} →` }),
      ...(originText === undefined ? {} : { originText })
    }
  })
}
