import type { ProjectSelectorSlice, RepoKind } from '../../application/project-selector-model'
import type { ReposSlice } from '../../application/repos-model'
import type { RepoSummary } from '../../application/ports/runtime-gateway'

export type ProjectSelectorRow = {
  readonly repoId: string
  readonly displayName: string
  readonly path: string
  readonly active: boolean
  readonly highlighted: boolean
}

export type ProjectSelectorListViewModel = {
  readonly view: 'list'
  readonly query: string
  readonly rows: readonly ProjectSelectorRow[]
  readonly addRowHighlighted: boolean
}

export type ProjectSelectorAddFormViewModel = {
  readonly view: 'add-form'
  readonly path: string
  readonly kind: RepoKind
  readonly submitLabel: string
  readonly submitEnabled: boolean
  readonly errorMessage: string | null
}

export type ProjectSelectorViewModel =
  | ProjectSelectorListViewModel
  | ProjectSelectorAddFormViewModel
  | null

const matchesQuery = (repo: RepoSummary, query: string): boolean => {
  const q = query.trim().toLowerCase()
  if (q === '') return true
  return repo.displayName.toLowerCase().includes(q) || repo.path.toLowerCase().includes(q)
}

/** Wraps highlightedIndex into `[0, total)` — always yields a valid highlight, wrapping either direction. */
const wrap = (index: number, total: number): number => ((index % total) + total) % total

/**
 * Pure render model for the ⌘P selector (design Area 4). Filters repos by query, always appends
 * the "+ agregar repo" row (even at 0 repos — fresh-orcad bootstrap), and wraps the highlight
 * index across [repos..., add-row] so ↑↓/Tab cycling never goes out of bounds.
 */
export function projectSelectorViewModel(
  slice: ProjectSelectorSlice,
  repos: ReposSlice
): ProjectSelectorViewModel {
  if (slice.view === 'closed') return null
  if (slice.view === 'add-form') {
    const submitting = slice.status === 'submitting'
    return {
      view: 'add-form',
      path: slice.path,
      kind: slice.kind,
      submitLabel: submitting ? 'agregando…' : 'agregar repo',
      submitEnabled: slice.path.trim() !== '' && !submitting,
      errorMessage: slice.status === 'error' ? (slice.errorMessage ?? 'error') : null
    }
  }
  const filtered = repos.list.filter((repo) => matchesQuery(repo, slice.query))
  const total = filtered.length + 1
  const index = wrap(slice.highlightedIndex, total)
  const rows = filtered.map((repo, i) => ({
    repoId: repo.id,
    displayName: repo.displayName,
    path: repo.path,
    active: repo.id === repos.activeRepoId,
    highlighted: i === index
  }))
  return { view: 'list', query: slice.query, rows, addRowHighlighted: index === filtered.length }
}
