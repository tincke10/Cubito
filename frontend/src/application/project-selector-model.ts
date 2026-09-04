export type RepoKind = 'git' | 'folder'
export type ProjectSelectorStatus = 'idle' | 'submitting' | 'error'

/** ⌘P selector's own state machine: closed → open (list+query) → add-form. Mirrors SpawnMenuSlice. */
export type ProjectSelectorSlice =
  | { view: 'closed' }
  | { view: 'open'; query: string; highlightedIndex: number }
  | {
      view: 'add-form'
      path: string
      kind: RepoKind
      status: ProjectSelectorStatus
      errorMessage?: string
    }

export const emptyProjectSelectorSlice = (): ProjectSelectorSlice => ({ view: 'closed' })

const openList = (): ProjectSelectorSlice => ({ view: 'open', query: '', highlightedIndex: 0 })

export type ProjectSelectorAction =
  | { type: 'open' }
  | { type: 'close' }
  | { type: 'set-query'; query: string }
  | { type: 'move-highlight'; delta: number }
  | { type: 'open-add-form' }
  | { type: 'update-add-field'; field: 'path' | 'kind'; value: string }
  | { type: 'submit-add' }
  | { type: 'submit-add-ok' }
  | { type: 'submit-add-error'; message: string }
  | { type: 'back-to-list' }

export function reduceProjectSelector(
  slice: ProjectSelectorSlice,
  action: ProjectSelectorAction
): ProjectSelectorSlice {
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
    case 'open-add-form':
      return slice.view === 'open'
        ? { view: 'add-form', path: '', kind: 'git', status: 'idle' }
        : slice
    case 'update-add-field':
      return updateAddField(slice, action.field, action.value)
    case 'submit-add':
      return startSubmit(slice)
    case 'submit-add-ok':
      return { view: 'closed' }
    case 'submit-add-error':
      return slice.view === 'add-form'
        ? { ...slice, status: 'error', errorMessage: action.message }
        : slice
    case 'back-to-list':
      return openList()
    default:
      return slice
  }
}

function updateAddField(
  slice: ProjectSelectorSlice,
  field: 'path' | 'kind',
  value: string
): ProjectSelectorSlice {
  if (slice.view !== 'add-form') return slice
  if (field === 'kind') return { ...slice, kind: value === 'folder' ? 'folder' : 'git' }
  return { ...slice, path: value }
}

function startSubmit(slice: ProjectSelectorSlice): ProjectSelectorSlice {
  if (slice.view !== 'add-form' || slice.status === 'submitting') return slice
  const { errorMessage: _errorMessage, ...rest } = slice
  return { ...rest, status: 'submitting' }
}
