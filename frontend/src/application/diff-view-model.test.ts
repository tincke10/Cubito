import { describe, expect, it } from 'vitest'
import { diffHudCounts, emptyDiffViewSlice, reduceDiffView } from './diff-view-model'
import type { DiffFileRow, DiffViewSlice } from './diff-view-model'
import type { DiffFileContent } from './ports/runtime-gateway'

const fileRow = (overrides: Partial<DiffFileRow> = {}): DiffFileRow => ({
  path: 'src/auth.ts',
  status: 'modified',
  added: 3,
  removed: 1,
  ...overrides
})

const openSlice = (overrides: Partial<Extract<DiffViewSlice, { view: 'open' }>> = {}) => ({
  view: 'open' as const,
  focusedNodeId: 'w1',
  baseRef: 'main',
  compare: null,
  status: 'loading' as const,
  files: [],
  selectedPath: null,
  panel: { kind: 'idle' as const },
  ...overrides
})

describe('emptyDiffViewSlice', () => {
  it('starts closed', () => {
    expect(emptyDiffViewSlice()).toEqual({ view: 'closed' })
  })
})

describe('reduceDiffView — open/close', () => {
  it('open anchors the view to the focused node and base ref, rail loading, panel idle', () => {
    const slice = reduceDiffView(emptyDiffViewSlice(), {
      type: 'open',
      nodeId: 'w1',
      baseRef: 'main'
    })
    expect(slice).toEqual(openSlice())
  })

  it('close returns to closed from any open state', () => {
    const slice = reduceDiffView(openSlice({ status: 'ready' }), { type: 'close' })
    expect(slice).toEqual({ view: 'closed' })
  })

  it('re-opening for a different node resets rail and panel', () => {
    const slice = reduceDiffView(
      openSlice({ focusedNodeId: 'w1', status: 'ready', files: [fileRow()] }),
      { type: 'open', nodeId: 'w2', baseRef: 'develop' }
    )
    expect(slice).toEqual(openSlice({ focusedNodeId: 'w2', baseRef: 'develop' }))
  })
})

describe('reduceDiffView — open-error / rail-error', () => {
  it('open-error marks the rail errored with a message', () => {
    const slice = reduceDiffView(openSlice(), { type: 'open-error', message: 'unknown base ref' })
    expect(slice).toEqual(openSlice({ status: 'error', errorMessage: 'unknown base ref' }))
  })

  it('rail-error marks the rail errored with a message', () => {
    const slice = reduceDiffView(openSlice(), { type: 'rail-error', message: 'git failed' })
    expect(slice).toEqual(openSlice({ status: 'error', errorMessage: 'git failed' }))
  })

  it('is a no-op when closed', () => {
    const closed = emptyDiffViewSlice()
    expect(reduceDiffView(closed, { type: 'open-error', message: 'x' })).toBe(closed)
    expect(reduceDiffView(closed, { type: 'rail-error', message: 'x' })).toBe(closed)
  })
})

describe('reduceDiffView — rail-loaded', () => {
  it('sets status ready with the compare and files when files is non-empty', () => {
    const compare = { headOid: 'abc', mergeBase: 'def' }
    const files = [fileRow()]
    const slice = reduceDiffView(openSlice(), { type: 'rail-loaded', compare, files })
    expect(slice).toEqual(openSlice({ compare, files, status: 'ready' }))
  })

  it('sets status empty when files is []', () => {
    const compare = { headOid: 'abc', mergeBase: 'def' }
    const slice = reduceDiffView(openSlice(), { type: 'rail-loaded', compare, files: [] })
    expect(slice).toEqual(openSlice({ compare, files: [], status: 'empty' }))
  })

  it('is a no-op when closed', () => {
    const closed = emptyDiffViewSlice()
    expect(
      reduceDiffView(closed, {
        type: 'rail-loaded',
        compare: { headOid: 'a', mergeBase: 'b' },
        files: []
      })
    ).toBe(closed)
  })
})

describe('reduceDiffView — select', () => {
  it('sets selectedPath and moves the panel to loading', () => {
    const slice = reduceDiffView(openSlice({ files: [fileRow()] }), {
      type: 'select',
      path: 'src/auth.ts'
    })
    expect(slice).toEqual(
      openSlice({ files: [fileRow()], selectedPath: 'src/auth.ts', panel: { kind: 'loading' } })
    )
  })

  it('is a no-op when closed', () => {
    const closed = emptyDiffViewSlice()
    expect(reduceDiffView(closed, { type: 'select', path: 'x' })).toBe(closed)
  })
})

describe('reduceDiffView — panel-loaded', () => {
  const selected = openSlice({ selectedPath: 'src/auth.ts', panel: { kind: 'loading' } })

  it('renders text content for the selected path', () => {
    const content: DiffFileContent = {
      kind: 'text',
      originalContent: 'old',
      modifiedContent: 'new',
      truncated: false
    }
    const slice = reduceDiffView(selected, { type: 'panel-loaded', path: 'src/auth.ts', content })
    expect(slice).toEqual(
      openSlice({
        selectedPath: 'src/auth.ts',
        panel: { kind: 'text', originalContent: 'old', modifiedContent: 'new', truncated: false }
      })
    )
  })

  it('renders binary content for the selected path', () => {
    const content: DiffFileContent = {
      kind: 'binary',
      mimeType: 'image/png',
      modifiedDeleted: true
    }
    const slice = reduceDiffView(selected, { type: 'panel-loaded', path: 'src/auth.ts', content })
    expect(slice).toEqual(
      openSlice({
        selectedPath: 'src/auth.ts',
        panel: { kind: 'binary', modifiedDeleted: true }
      })
    )
  })

  it('ignores a stale load for a path that is no longer selected', () => {
    const content: DiffFileContent = {
      kind: 'text',
      originalContent: 'old',
      modifiedContent: 'new',
      truncated: false
    }
    const slice = reduceDiffView(selected, { type: 'panel-loaded', path: 'src/other.ts', content })
    expect(slice).toBe(selected)
  })

  it('is a no-op when closed', () => {
    const closed = emptyDiffViewSlice()
    const content: DiffFileContent = { kind: 'binary' }
    expect(reduceDiffView(closed, { type: 'panel-loaded', path: 'x', content })).toBe(closed)
  })
})

describe('reduceDiffView — panel-error', () => {
  it('renders an error for the selected path', () => {
    const selected = openSlice({ selectedPath: 'src/auth.ts', panel: { kind: 'loading' } })
    const slice = reduceDiffView(selected, {
      type: 'panel-error',
      path: 'src/auth.ts',
      message: 'boom'
    })
    expect(slice).toEqual(
      openSlice({ selectedPath: 'src/auth.ts', panel: { kind: 'error', message: 'boom' } })
    )
  })

  it('ignores a stale error for a path that is no longer selected', () => {
    const selected = openSlice({ selectedPath: 'src/auth.ts', panel: { kind: 'loading' } })
    const slice = reduceDiffView(selected, { type: 'panel-error', path: 'src/other.ts' })
    expect(slice).toBe(selected)
  })

  it('is a no-op when closed', () => {
    const closed = emptyDiffViewSlice()
    expect(reduceDiffView(closed, { type: 'panel-error', path: 'x' })).toBe(closed)
  })
})

describe('diffHudCounts', () => {
  it('is all-zero when closed', () => {
    expect(diffHudCounts(emptyDiffViewSlice())).toEqual({ files: 0, added: 0, removed: 0 })
  })

  it('sums added/removed across files', () => {
    const slice = openSlice({
      files: [fileRow({ added: 3, removed: 1 }), fileRow({ path: 'b.ts', added: 5, removed: 0 })]
    })
    expect(diffHudCounts(slice)).toEqual({ files: 2, added: 8, removed: 1 })
  })
})
