/** A file indented with tabs keeps getting tabs; anything else gets two spaces. */
export function indentUnitFor(content: string): string {
  return /^\t/m.test(content) ? '\t' : '  '
}

export function insertIndent(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  unit: string
): { value: string; caret: number } {
  return {
    value: value.slice(0, selectionStart) + unit + value.slice(selectionEnd),
    caret: selectionStart + unit.length
  }
}
