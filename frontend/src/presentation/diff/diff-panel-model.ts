import type { DiffPanelState } from '../../application/diff-view-model'
import { computeLineDiff, type DiffLine } from './line-diff'

export type DiffPanelLineView = {
  cssClass: string
  oldNo: number | null
  newNo: number | null
  text: string
}

export type DiffPanelView =
  | { kind: 'lines'; lines: readonly DiffPanelLineView[]; truncated: boolean }
  | { kind: 'binary'; deleted: boolean }
  | { kind: 'loading' }
  | { kind: 'idle' }
  | { kind: 'error'; message?: string }

const LINE_CSS_CLASS: Record<DiffLine['kind'], string> = {
  ctx: 'diff-line--ctx',
  add: 'diff-line--add',
  del: 'diff-line--del'
}

const toLineView = (line: DiffLine): DiffPanelLineView => ({
  cssClass: LINE_CSS_CLASS[line.kind],
  oldNo: line.oldNo,
  newNo: line.newNo,
  text: line.text
})

/** Pure projection of DiffPanelState into a render model for the diff panel. No DOM. */
export function diffPanelViewModel(panel: DiffPanelState): DiffPanelView {
  switch (panel.kind) {
    case 'text':
      return {
        kind: 'lines',
        lines: computeLineDiff(panel.originalContent, panel.modifiedContent).map(toLineView),
        truncated: panel.truncated
      }
    case 'binary':
      return { kind: 'binary', deleted: panel.modifiedDeleted ?? false }
    case 'loading':
      return { kind: 'loading' }
    case 'idle':
      return { kind: 'idle' }
    case 'error':
      return panel.message === undefined
        ? { kind: 'error' }
        : { kind: 'error', message: panel.message }
  }
}
