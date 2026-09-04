/** ⌘K palette's own state machine: closed → open (query+highlight). Strict subset of
 *  ProjectSelectorSlice — no add-form; the catalog is static, not fetched. */
export type CommandPaletteSlice =
  | { view: 'closed' }
  | { view: 'open'; query: string; highlightedIndex: number }

export const emptyCommandPaletteSlice = (): CommandPaletteSlice => ({ view: 'closed' })

const openList = (): CommandPaletteSlice => ({ view: 'open', query: '', highlightedIndex: 0 })

export type CommandPaletteAction =
  | { type: 'open' }
  | { type: 'close' }
  | { type: 'set-query'; query: string }
  | { type: 'move-highlight'; delta: number }

export function reduceCommandPalette(
  slice: CommandPaletteSlice,
  action: CommandPaletteAction
): CommandPaletteSlice {
  switch (action.type) {
    case 'open':
      return openList()
    case 'close':
      return { view: 'closed' }
    case 'set-query':
      return slice.view === 'open' ? { ...slice, query: action.query, highlightedIndex: 0 } : slice
    case 'move-highlight':
      return slice.view === 'open'
        ? { ...slice, highlightedIndex: slice.highlightedIndex + action.delta }
        : slice
    default:
      return slice
  }
}
