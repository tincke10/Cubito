import { describe, expect, it } from 'vitest'
import {
  cycleIsland,
  emptyReposSlice,
  nextIsland,
  reconcileActiveRepoId,
  reduceRepos
} from './repos-model'
import type { RepoSummary } from './ports/runtime-gateway'

const repo = (id: string): RepoSummary => ({ id, path: `/${id}`, displayName: id, kind: 'git' })

describe('emptyReposSlice', () => {
  it('starts with an empty list and no active repo', () => {
    expect(emptyReposSlice()).toEqual({ list: [], activeRepoId: null })
  })
})

describe('reduceRepos: set-list', () => {
  it('defaults activeRepoId to the first repo when none was active', () => {
    const next = reduceRepos(emptyReposSlice(), { type: 'set-list', list: [repo('a'), repo('b')] })
    expect(next.activeRepoId).toBe('a')
    expect(next.list).toEqual([repo('a'), repo('b')])
  })

  it('keeps the current activeRepoId when it survives the new list', () => {
    const slice = { list: [repo('a'), repo('b')], activeRepoId: 'b' }
    const next = reduceRepos(slice, { type: 'set-list', list: [repo('b'), repo('a')] })
    expect(next.activeRepoId).toBe('b')
  })

  it('repicks the first repo when the current active one was removed', () => {
    const slice = { list: [repo('a'), repo('b')], activeRepoId: 'b' }
    const next = reduceRepos(slice, { type: 'set-list', list: [repo('a'), repo('c')] })
    expect(next.activeRepoId).toBe('a')
  })

  it('goes to null when the list becomes empty', () => {
    const slice = { list: [repo('a')], activeRepoId: 'a' }
    const next = reduceRepos(slice, { type: 'set-list', list: [] })
    expect(next.activeRepoId).toBeNull()
  })
})

describe('reduceRepos: set-active', () => {
  it('overrides activeRepoId directly', () => {
    const slice = { list: [repo('a'), repo('b')], activeRepoId: 'a' }
    const next = reduceRepos(slice, { type: 'set-active', repoId: 'b' })
    expect(next.activeRepoId).toBe('b')
    expect(next.list).toBe(slice.list)
  })
})

describe('reconcileActiveRepoId', () => {
  it('keeps current when still present in the list', () => {
    expect(reconcileActiveRepoId([repo('a'), repo('b')], 'b')).toBe('b')
  })

  it('falls back to the first repo when current is null or absent', () => {
    expect(reconcileActiveRepoId([repo('a'), repo('b')], null)).toBe('a')
    expect(reconcileActiveRepoId([repo('a'), repo('b')], 'ghost')).toBe('a')
  })

  it('is null for an empty list', () => {
    expect(reconcileActiveRepoId([], 'a')).toBeNull()
  })
})

describe('nextIsland', () => {
  it('wraps around to the first repo after the last', () => {
    const list = [repo('a'), repo('b'), repo('c')]
    expect(nextIsland(list, 'c')).toBe('a')
    expect(nextIsland(list, 'a')).toBe('b')
  })

  it('returns the first repo when activeRepoId is null or not found', () => {
    const list = [repo('a'), repo('b')]
    expect(nextIsland(list, null)).toBe('a')
    expect(nextIsland(list, 'ghost')).toBe('a')
  })

  it('is null for an empty list', () => {
    expect(nextIsland([], null)).toBeNull()
  })
})

describe('cycleIsland', () => {
  it('wraps forward with step 1, same as nextIsland', () => {
    const list = [repo('a'), repo('b'), repo('c')]
    expect(cycleIsland(list, 'c', 1)).toBe('a')
    expect(cycleIsland(list, 'a', 1)).toBe('b')
  })

  it('wraps backward with step -1', () => {
    const list = [repo('a'), repo('b'), repo('c')]
    expect(cycleIsland(list, 'a', -1)).toBe('c')
    expect(cycleIsland(list, 'b', -1)).toBe('a')
  })

  it('returns the first repo when the active id is unknown, on either step', () => {
    const list = [repo('a'), repo('b')]
    expect(cycleIsland(list, 'ghost', 1)).toBe('a')
    expect(cycleIsland(list, 'ghost', -1)).toBe('a')
    expect(cycleIsland(list, null, -1)).toBe('a')
  })

  it('returns null for an empty list on either step', () => {
    expect(cycleIsland([], null, 1)).toBeNull()
    expect(cycleIsland([], null, -1)).toBeNull()
  })
})
