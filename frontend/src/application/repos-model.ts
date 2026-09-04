import type { RepoSummary } from './ports/runtime-gateway'

export type ReposSlice = { list: readonly RepoSummary[]; activeRepoId: string | null }

export const emptyReposSlice = (): ReposSlice => ({ list: [], activeRepoId: null })

export type ReposAction =
  | { type: 'set-list'; list: readonly RepoSummary[] }
  | { type: 'set-active'; repoId: string }

/** Unchanged when still in the list; the first repo otherwise; `null` when the list is empty. */
export function reconcileActiveRepoId(
  list: readonly RepoSummary[],
  current: string | null
): string | null {
  if (current !== null && list.some((repo) => repo.id === current)) {
    return current
  }
  return list[0]?.id ?? null
}

/** Wrap-around cycle for Tab: the repo after `activeRepoId`, or the first when absent/null. */
export function nextIsland(
  list: readonly RepoSummary[],
  activeRepoId: string | null
): string | null {
  if (list.length === 0) {
    return null
  }
  const index = list.findIndex((repo) => repo.id === activeRepoId)
  return index === -1 ? list[0]!.id : list[(index + 1) % list.length]!.id
}

export function reduceRepos(slice: ReposSlice, action: ReposAction): ReposSlice {
  switch (action.type) {
    case 'set-list':
      return {
        list: action.list,
        activeRepoId: reconcileActiveRepoId(action.list, slice.activeRepoId)
      }
    case 'set-active':
      return { ...slice, activeRepoId: action.repoId }
    default:
      return slice
  }
}
