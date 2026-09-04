import { describe, expect, it } from 'vitest'
import { projectSelectorViewModel } from './project-selector-view-model'
import type { ProjectSelectorSlice } from '../../application/project-selector-model'
import type { ReposSlice } from '../../application/repos-model'
import type { RepoSummary } from '../../application/ports/runtime-gateway'

const repo = (overrides: Partial<RepoSummary> = {}): RepoSummary => ({
  id: 'repo-1',
  path: '/home/user/repo-one',
  displayName: 'Repo One',
  kind: 'git',
  ...overrides
})

const reposSlice = (
  list: readonly RepoSummary[],
  activeRepoId: string | null = null
): ReposSlice => ({
  list,
  activeRepoId
})

describe('projectSelectorViewModel', () => {
  it('returns null when closed', () => {
    expect(projectSelectorViewModel({ view: 'closed' }, reposSlice([]))).toBeNull()
  })

  it('lists every repo with the active one flagged, and appends the add-row', () => {
    const slice: ProjectSelectorSlice = { view: 'open', query: '', highlightedIndex: 0 }
    const repos = reposSlice([repo({ id: 'a' }), repo({ id: 'b', displayName: 'Repo Two' })], 'b')
    const model = projectSelectorViewModel(slice, repos)
    expect(model).toMatchObject({ view: 'list', query: '' })
    if (model?.view !== 'list') throw new Error('expected list view')
    expect(model.rows).toEqual([
      {
        repoId: 'a',
        displayName: 'Repo One',
        path: '/home/user/repo-one',
        active: false,
        highlighted: true
      },
      {
        repoId: 'b',
        displayName: 'Repo Two',
        path: '/home/user/repo-one',
        active: true,
        highlighted: false
      }
    ])
    expect(model.addRowHighlighted).toBe(false)
  })

  it('always appends the add-row even at 0 repos, and it is highlighted (only item)', () => {
    const slice: ProjectSelectorSlice = { view: 'open', query: '', highlightedIndex: 0 }
    const model = projectSelectorViewModel(slice, reposSlice([]))
    expect(model).toMatchObject({ view: 'list', rows: [], addRowHighlighted: true })
  })

  it('filters case-insensitively by displayName or path', () => {
    const slice: ProjectSelectorSlice = { view: 'open', query: 'TWO', highlightedIndex: 0 }
    const repos = reposSlice([
      repo({ id: 'a' }),
      repo({ id: 'b', displayName: 'Repo Two', path: '/x/two' })
    ])
    const model = projectSelectorViewModel(slice, repos)
    if (model?.view !== 'list') throw new Error('expected list view')
    expect(model.rows.map((r) => r.repoId)).toEqual(['b'])

    const byPath = projectSelectorViewModel(
      { view: 'open', query: 'repo-one', highlightedIndex: 0 },
      repos
    )
    if (byPath?.view !== 'list') throw new Error('expected list view')
    expect(byPath.rows.map((r) => r.repoId)).toEqual(['a'])
  })

  it('a query matching nothing yields an empty row list with the add-row highlighted', () => {
    const repos = reposSlice([repo()])
    const model = projectSelectorViewModel(
      { view: 'open', query: 'nope', highlightedIndex: 0 },
      repos
    )
    expect(model).toMatchObject({ view: 'list', rows: [], addRowHighlighted: true })
  })

  it('wraps a highlightedIndex past the end back onto the add-row, then the first repo', () => {
    const repos = reposSlice([repo({ id: 'a' }), repo({ id: 'b' })])
    // total = 3 (2 repos + add-row): index 2 -> add-row, index 3 -> wraps to 0
    const atAddRow = projectSelectorViewModel(
      { view: 'open', query: '', highlightedIndex: 2 },
      repos
    )
    expect(atAddRow).toMatchObject({ addRowHighlighted: true })
    const wrapped = projectSelectorViewModel(
      { view: 'open', query: '', highlightedIndex: 3 },
      repos
    )
    if (wrapped?.view !== 'list') throw new Error('expected list view')
    expect(wrapped.rows[0]!.highlighted).toBe(true)
    expect(wrapped.addRowHighlighted).toBe(false)
  })

  it('wraps a negative highlightedIndex back from the end', () => {
    const repos = reposSlice([repo({ id: 'a' }), repo({ id: 'b' })])
    // total = 3; index -1 wraps to 2 (the add-row)
    const model = projectSelectorViewModel({ view: 'open', query: '', highlightedIndex: -1 }, repos)
    expect(model).toMatchObject({ addRowHighlighted: true })
  })

  it('renders the add-form view with submit gating and error passthrough', () => {
    const idle = projectSelectorViewModel(
      { view: 'add-form', path: '', kind: 'git', status: 'idle' },
      reposSlice([])
    )
    expect(idle).toEqual({
      view: 'add-form',
      path: '',
      kind: 'git',
      submitLabel: 'agregar repo',
      submitEnabled: false,
      errorMessage: null
    })

    const filled = projectSelectorViewModel(
      { view: 'add-form', path: '/abs/path', kind: 'folder', status: 'idle' },
      reposSlice([])
    )
    expect(filled).toMatchObject({ submitEnabled: true, kind: 'folder' })

    const submitting = projectSelectorViewModel(
      { view: 'add-form', path: '/abs/path', kind: 'git', status: 'submitting' },
      reposSlice([])
    )
    expect(submitting).toMatchObject({ submitLabel: 'agregando…', submitEnabled: false })

    const errored = projectSelectorViewModel(
      {
        view: 'add-form',
        path: '/abs/path',
        kind: 'git',
        status: 'error',
        errorMessage: 'no es un repo git'
      },
      reposSlice([])
    )
    expect(errored).toMatchObject({ errorMessage: 'no es un repo git' })
  })
})
