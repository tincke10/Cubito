export type DiffLineKind = 'ctx' | 'add' | 'del'

export type DiffLine = {
  kind: DiffLineKind
  text: string
  oldNo: number | null
  newNo: number | null
}

const NEWLINE = '\n'
const FIRST_LINE_NO = 1

const splitLines = (text: string): readonly string[] =>
  text.length === 0 ? [] : text.split(NEWLINE)

/** Classic bottom-up LCS length table over lines (no dependency). */
function lcsTable(oldLines: readonly string[], newLines: readonly string[]): number[][] {
  const rows = oldLines.length
  const cols = newLines.length
  const table: number[][] = Array.from({ length: rows + 1 }, () =>
    Array.from({ length: cols + 1 }, () => 0)
  )
  for (let i = rows - 1; i >= 0; i--) {
    for (let j = cols - 1; j >= 0; j--) {
      table[i]![j] =
        oldLines[i] === newLines[j]
          ? table[i + 1]![j + 1]! + 1
          : Math.max(table[i + 1]![j]!, table[i]![j + 1]!)
    }
  }
  return table
}

/** Back-traces the LCS table into ctx/add/del lines, tracking 1-based old/new line numbers. */
function backtrace(
  oldLines: readonly string[],
  newLines: readonly string[],
  table: number[][]
): DiffLine[] {
  const lines: DiffLine[] = []
  let i = 0
  let j = 0
  let oldNo = FIRST_LINE_NO
  let newNo = FIRST_LINE_NO
  while (i < oldLines.length && j < newLines.length) {
    if (oldLines[i] === newLines[j]) {
      lines.push({ kind: 'ctx', text: oldLines[i]!, oldNo: oldNo++, newNo: newNo++ })
      i++
      j++
    } else if (table[i + 1]![j]! >= table[i]![j + 1]!) {
      lines.push({ kind: 'del', text: oldLines[i]!, oldNo: oldNo++, newNo: null })
      i++
    } else {
      lines.push({ kind: 'add', text: newLines[j]!, oldNo: null, newNo: newNo++ })
      j++
    }
  }
  while (i < oldLines.length) {
    lines.push({ kind: 'del', text: oldLines[i]!, oldNo: oldNo++, newNo: null })
    i++
  }
  while (j < newLines.length) {
    lines.push({ kind: 'add', text: newLines[j]!, oldNo: null, newNo: newNo++ })
    j++
  }
  return lines
}

/** Pure line-level diff via hand-rolled LCS (split on \n, DP table, back-trace). No DOM. */
export function computeLineDiff(original: string, modified: string): readonly DiffLine[] {
  const oldLines = splitLines(original)
  const newLines = splitLines(modified)
  return backtrace(oldLines, newLines, lcsTable(oldLines, newLines))
}
