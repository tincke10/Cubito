import { describe, expect, it } from 'vitest'
import { emptyCompareChildLoad, reduceCompareChildLoad } from './compare-child-load'
import type { CompareChildLoad } from './compare-child-load'
import type { DiffFileRow } from './diff-view-model'
import type { DiffFileContent } from './ports/runtime-gateway'

const fileRow = (overrides: Partial<DiffFileRow> = {}): DiffFileRow => ({
  path: 'src/auth.ts',
  status: 'modified',
  added: 3,
  removed: 1,
  ...overrides
})

const CHILD_ID = 'w-child-1'

describe('emptyCompareChildLoad', () => {
  it('starts loading with no compare/files/selection', () => {
    expect(emptyCompareChildLoad()).toEqual({
      baseRef: '',
      status: 'loading',
      compare: null,
      files: [],
      selectedPath: null,
      panel: { kind: 'idle' }
    })
  })
})

describe('reduceCompareChildLoad — child-rail-loaded / child-rail-error', () => {
  it('sets status ready with the compare and files when files is non-empty', () => {
    const compare = { headOid: 'abc', mergeBase: 'def' }
    const files = [fileRow()]
    const load = reduceCompareChildLoad(emptyCompareChildLoad(), {
      type: 'child-rail-loaded',
      childId: CHILD_ID,
      compare,
      files
    })
    expect(load).toEqual({ ...emptyCompareChildLoad(), compare, files, status: 'ready' })
  })

  it('sets status empty when files is []', () => {
    const compare = { headOid: 'abc', mergeBase: 'def' }
    const load = reduceCompareChildLoad(emptyCompareChildLoad(), {
      type: 'child-rail-loaded',
      childId: CHILD_ID,
      compare,
      files: []
    })
    expect(load).toEqual({ ...emptyCompareChildLoad(), compare, files: [], status: 'empty' })
  })

  it('marks the child errored with a message, leaving other members unaffected (isolated per child)', () => {
    const load = reduceCompareChildLoad(emptyCompareChildLoad(), {
      type: 'child-rail-error',
      childId: CHILD_ID,
      message: 'sin ancestro común con la base'
    })
    expect(load).toEqual({
      ...emptyCompareChildLoad(),
      status: 'error',
      errorMessage: 'sin ancestro común con la base'
    })
  })
})

describe('reduceCompareChildLoad — select-file / child-panel-loaded / child-panel-error', () => {
  it('select-file sets selectedPath and moves the panel to loading', () => {
    const load = reduceCompareChildLoad(
      { ...emptyCompareChildLoad(), files: [fileRow()] },
      { type: 'select-file', childId: CHILD_ID, path: 'src/auth.ts' }
    )
    expect(load).toMatchObject({ selectedPath: 'src/auth.ts', panel: { kind: 'loading' } })
  })

  it('child-panel-loaded renders text content for the selected path', () => {
    const selected = { ...emptyCompareChildLoad(), selectedPath: 'src/auth.ts' }
    const content: DiffFileContent = {
      kind: 'text',
      originalContent: 'old',
      modifiedContent: 'new',
      truncated: false
    }
    const load = reduceCompareChildLoad(selected, {
      type: 'child-panel-loaded',
      childId: CHILD_ID,
      path: 'src/auth.ts',
      content
    })
    expect(load.panel).toEqual({
      kind: 'text',
      originalContent: 'old',
      modifiedContent: 'new',
      truncated: false
    })
  })

  it('ignores a stale child-panel-loaded for a path that is no longer selected', () => {
    const selected: CompareChildLoad = { ...emptyCompareChildLoad(), selectedPath: 'src/auth.ts' }
    const content: DiffFileContent = { kind: 'binary' }
    const load = reduceCompareChildLoad(selected, {
      type: 'child-panel-loaded',
      childId: CHILD_ID,
      path: 'src/other.ts',
      content
    })
    expect(load).toBe(selected)
  })

  it('child-panel-error renders an error for the selected path', () => {
    const selected = { ...emptyCompareChildLoad(), selectedPath: 'src/auth.ts' }
    const load = reduceCompareChildLoad(selected, {
      type: 'child-panel-error',
      childId: CHILD_ID,
      path: 'src/auth.ts',
      message: 'boom'
    })
    expect(load.panel).toEqual({ kind: 'error', message: 'boom' })
  })

  it('ignores a stale child-panel-error for a path that is no longer selected', () => {
    const selected: CompareChildLoad = { ...emptyCompareChildLoad(), selectedPath: 'src/auth.ts' }
    const load = reduceCompareChildLoad(selected, {
      type: 'child-panel-error',
      childId: CHILD_ID,
      path: 'src/other.ts'
    })
    expect(load).toBe(selected)
  })
})
