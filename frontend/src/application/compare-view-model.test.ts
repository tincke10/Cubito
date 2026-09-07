import { describe, expect, it } from 'vitest'
import { emptyCompareViewSlice, reduceCompareView } from './compare-view-model'
import { emptyCompareChildLoad } from './compare-child-load'
import type { DiffFileRow } from './diff-view-model'

const fileRow = (overrides: Partial<DiffFileRow> = {}): DiffFileRow => ({
  path: 'src/auth.ts',
  status: 'modified',
  added: 3,
  removed: 1,
  ...overrides
})

const MEMBERS = ['w-child-1', 'w-child-2'] as const

const openSlice = (members: readonly string[] = MEMBERS) =>
  reduceCompareView(emptyCompareViewSlice(), { type: 'open', members })

describe('emptyCompareViewSlice', () => {
  it('starts closed', () => {
    expect(emptyCompareViewSlice()).toEqual({ view: 'closed' })
  })
})

describe('reduceCompareView — open/close', () => {
  it('open anchors to every member with an idle-loading child load each, no focus, no winner', () => {
    const slice = openSlice()
    expect(slice).toEqual({
      view: 'open',
      members: MEMBERS,
      focusedChildId: null,
      winnerId: null,
      childLoads: {
        'w-child-1': emptyCompareChildLoad(),
        'w-child-2': emptyCompareChildLoad()
      }
    })
  })

  it('close returns to closed from any open state', () => {
    expect(reduceCompareView(openSlice(), { type: 'close' })).toEqual({ view: 'closed' })
  })

  it('re-opening replaces the member set and resets every child load', () => {
    const slice = reduceCompareView(openSlice(), { type: 'open', members: ['w-child-3'] })
    expect(slice).toEqual({
      view: 'open',
      members: ['w-child-3'],
      focusedChildId: null,
      winnerId: null,
      childLoads: { 'w-child-3': emptyCompareChildLoad() }
    })
  })
})

describe('reduceCompareView — focus-child', () => {
  it('sets focusedChildId when open', () => {
    const slice = reduceCompareView(openSlice(), { type: 'focus-child', childId: 'w-child-1' })
    expect(slice).toMatchObject({ focusedChildId: 'w-child-1' })
  })

  it('is a no-op when closed', () => {
    const closed = emptyCompareViewSlice()
    expect(reduceCompareView(closed, { type: 'focus-child', childId: 'w-child-1' })).toBe(closed)
  })
})

describe('reduceCompareView — set-winner', () => {
  it('records the winner (record-only, no merge)', () => {
    const slice = reduceCompareView(openSlice(), { type: 'set-winner', winnerId: 'w-child-2' })
    expect(slice).toMatchObject({ winnerId: 'w-child-2' })
  })

  it('clears the winner with null', () => {
    const withWinner = reduceCompareView(openSlice(), { type: 'set-winner', winnerId: 'w-child-1' })
    const cleared = reduceCompareView(withWinner, { type: 'set-winner', winnerId: null })
    expect(cleared).toMatchObject({ winnerId: null })
  })

  it('is a no-op when closed', () => {
    const closed = emptyCompareViewSlice()
    expect(reduceCompareView(closed, { type: 'set-winner', winnerId: 'w-child-1' })).toBe(closed)
  })
})

describe('reduceCompareView — per-child load actions route by childId', () => {
  it('child-rail-loaded updates only the targeted child, leaving siblings untouched', () => {
    const before = openSlice()
    const compare = { headOid: 'abc', mergeBase: 'def' }
    const files = [fileRow()]
    const slice = reduceCompareView(before, {
      type: 'child-rail-loaded',
      childId: 'w-child-1',
      compare,
      files
    })
    expect(slice).toMatchObject({ view: 'open' })
    if (slice.view !== 'open') throw new Error('unreachable')
    expect(slice.childLoads['w-child-1']).toMatchObject({ status: 'ready', compare, files })
    expect(slice.childLoads['w-child-2']).toBe(
      (before as Extract<typeof before, { view: 'open' }>).childLoads['w-child-2']
    )
  })

  it('child-rail-error is isolated per child (continue-on-error)', () => {
    const slice = reduceCompareView(openSlice(), {
      type: 'child-rail-error',
      childId: 'w-child-2',
      message: 'base inválida'
    })
    if (slice.view !== 'open') throw new Error('unreachable')
    expect(slice.childLoads['w-child-2']).toMatchObject({
      status: 'error',
      errorMessage: 'base inválida'
    })
    expect(slice.childLoads['w-child-1']).toEqual(emptyCompareChildLoad())
  })

  it('select-file, child-panel-loaded and child-panel-error are scoped to the given childId', () => {
    const withFiles = reduceCompareView(openSlice(), {
      type: 'child-rail-loaded',
      childId: 'w-child-1',
      compare: { headOid: 'a', mergeBase: 'b' },
      files: [fileRow()]
    })
    const selected = reduceCompareView(withFiles, {
      type: 'select-file',
      childId: 'w-child-1',
      path: 'src/auth.ts'
    })
    if (selected.view !== 'open') throw new Error('unreachable')
    expect(selected.childLoads['w-child-1']).toMatchObject({
      selectedPath: 'src/auth.ts',
      panel: { kind: 'loading' }
    })

    const loaded = reduceCompareView(selected, {
      type: 'child-panel-loaded',
      childId: 'w-child-1',
      path: 'src/auth.ts',
      content: { kind: 'binary' }
    })
    if (loaded.view !== 'open') throw new Error('unreachable')
    expect(loaded.childLoads['w-child-1']?.panel).toEqual({ kind: 'binary' })

    const errored = reduceCompareView(loaded, {
      type: 'child-panel-error',
      childId: 'w-child-1',
      path: 'src/other.ts'
    })
    // stale path — no-op, panel keeps the loaded content
    if (errored.view !== 'open') throw new Error('unreachable')
    expect(errored.childLoads['w-child-1']).toBe(loaded.childLoads['w-child-1'])
  })

  it('is a no-op for a childId not in the member set', () => {
    const before = openSlice()
    const slice = reduceCompareView(before, {
      type: 'child-rail-error',
      childId: 'w-not-a-member',
      message: 'x'
    })
    expect(slice).toBe(before)
  })

  it('every per-child action is a no-op when closed', () => {
    const closed = emptyCompareViewSlice()
    expect(
      reduceCompareView(closed, { type: 'select-file', childId: 'w-child-1', path: 'x' })
    ).toBe(closed)
    expect(
      reduceCompareView(closed, {
        type: 'child-rail-loaded',
        childId: 'w-child-1',
        compare: { headOid: 'a', mergeBase: 'b' },
        files: []
      })
    ).toBe(closed)
  })
})
