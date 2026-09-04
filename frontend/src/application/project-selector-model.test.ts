import { describe, expect, it } from 'vitest'
import { emptyProjectSelectorSlice, reduceProjectSelector } from './project-selector-model'
import type { ProjectSelectorSlice } from './project-selector-model'

describe('reduceProjectSelector', () => {
  it('emptyProjectSelectorSlice starts closed', () => {
    expect(emptyProjectSelectorSlice()).toEqual({ view: 'closed' })
  })

  it('open transitions to the list view with an empty query and highlight at 0', () => {
    expect(reduceProjectSelector(emptyProjectSelectorSlice(), { type: 'open' })).toEqual({
      view: 'open',
      query: '',
      highlightedIndex: 0
    })
  })

  it('open resets an already-open or add-form slice back to a fresh list view', () => {
    const open: ProjectSelectorSlice = { view: 'open', query: 'foo', highlightedIndex: 3 }
    expect(reduceProjectSelector(open, { type: 'open' })).toEqual({
      view: 'open',
      query: '',
      highlightedIndex: 0
    })
    const addForm: ProjectSelectorSlice = {
      view: 'add-form',
      path: '/x',
      kind: 'git',
      status: 'idle'
    }
    expect(reduceProjectSelector(addForm, { type: 'open' })).toEqual({
      view: 'open',
      query: '',
      highlightedIndex: 0
    })
  })

  it('close always returns to closed, from any view', () => {
    expect(
      reduceProjectSelector({ view: 'open', query: 'x', highlightedIndex: 1 }, { type: 'close' })
    ).toEqual({
      view: 'closed'
    })
    expect(
      reduceProjectSelector(
        { view: 'add-form', path: '/x', kind: 'git', status: 'idle' },
        { type: 'close' }
      )
    ).toEqual({ view: 'closed' })
  })

  it('set-query updates the query and resets highlightedIndex to 0', () => {
    const slice: ProjectSelectorSlice = { view: 'open', query: '', highlightedIndex: 2 }
    expect(reduceProjectSelector(slice, { type: 'set-query', query: 'cubi' })).toEqual({
      view: 'open',
      query: 'cubi',
      highlightedIndex: 0
    })
  })

  it('set-query is a no-op outside the open view', () => {
    const closed = emptyProjectSelectorSlice()
    expect(reduceProjectSelector(closed, { type: 'set-query', query: 'x' })).toBe(closed)
  })

  it('move-highlight adds delta to highlightedIndex, positive or negative, unbounded', () => {
    const slice: ProjectSelectorSlice = { view: 'open', query: '', highlightedIndex: 0 }
    expect(reduceProjectSelector(slice, { type: 'move-highlight', delta: 1 })).toEqual({
      view: 'open',
      query: '',
      highlightedIndex: 1
    })
    expect(reduceProjectSelector(slice, { type: 'move-highlight', delta: -1 })).toEqual({
      view: 'open',
      query: '',
      highlightedIndex: -1
    })
  })

  it('move-highlight is a no-op outside the open view', () => {
    const closed = emptyProjectSelectorSlice()
    expect(reduceProjectSelector(closed, { type: 'move-highlight', delta: 1 })).toBe(closed)
  })

  it('open-add-form transitions from open to a fresh idle add-form', () => {
    const slice: ProjectSelectorSlice = { view: 'open', query: 'x', highlightedIndex: 2 }
    expect(reduceProjectSelector(slice, { type: 'open-add-form' })).toEqual({
      view: 'add-form',
      path: '',
      kind: 'git',
      status: 'idle'
    })
  })

  it('open-add-form is a no-op outside the open view', () => {
    const closed = emptyProjectSelectorSlice()
    expect(reduceProjectSelector(closed, { type: 'open-add-form' })).toBe(closed)
  })

  it('update-add-field updates path and kind independently', () => {
    const slice: ProjectSelectorSlice = { view: 'add-form', path: '', kind: 'git', status: 'idle' }
    const withPath = reduceProjectSelector(slice, {
      type: 'update-add-field',
      field: 'path',
      value: '/abs/path'
    })
    expect(withPath).toEqual({ view: 'add-form', path: '/abs/path', kind: 'git', status: 'idle' })
    const withKind = reduceProjectSelector(withPath, {
      type: 'update-add-field',
      field: 'kind',
      value: 'folder'
    })
    expect(withKind).toEqual({
      view: 'add-form',
      path: '/abs/path',
      kind: 'folder',
      status: 'idle'
    })
  })

  it('update-add-field with an unrecognized kind value falls back to git', () => {
    const slice: ProjectSelectorSlice = {
      view: 'add-form',
      path: '',
      kind: 'folder',
      status: 'idle'
    }
    expect(
      reduceProjectSelector(slice, { type: 'update-add-field', field: 'kind', value: 'bogus' })
    ).toMatchObject({ kind: 'git' })
  })

  it('update-add-field is a no-op outside the add-form view', () => {
    const closed = emptyProjectSelectorSlice()
    expect(
      reduceProjectSelector(closed, { type: 'update-add-field', field: 'path', value: 'x' })
    ).toBe(closed)
  })

  it('submit-add moves an idle form to submitting and clears any error', () => {
    const slice: ProjectSelectorSlice = {
      view: 'add-form',
      path: '/x',
      kind: 'git',
      status: 'error',
      errorMessage: 'boom'
    }
    const next = reduceProjectSelector(slice, { type: 'submit-add' })
    expect(next).toEqual({ view: 'add-form', path: '/x', kind: 'git', status: 'submitting' })
    expect('errorMessage' in (next as { errorMessage?: string })).toBe(false)
  })

  it('submit-add is a no-op when already submitting', () => {
    const slice: ProjectSelectorSlice = {
      view: 'add-form',
      path: '/x',
      kind: 'git',
      status: 'submitting'
    }
    expect(reduceProjectSelector(slice, { type: 'submit-add' })).toBe(slice)
  })

  it('submit-add is a no-op outside the add-form view', () => {
    const open: ProjectSelectorSlice = { view: 'open', query: '', highlightedIndex: 0 }
    expect(reduceProjectSelector(open, { type: 'submit-add' })).toBe(open)
  })

  it('submit-add-ok closes the selector', () => {
    const slice: ProjectSelectorSlice = {
      view: 'add-form',
      path: '/x',
      kind: 'git',
      status: 'submitting'
    }
    expect(reduceProjectSelector(slice, { type: 'submit-add-ok' })).toEqual({ view: 'closed' })
  })

  it('submit-add-error moves a submitting form to error, keeping field values intact', () => {
    const slice: ProjectSelectorSlice = {
      view: 'add-form',
      path: '/x',
      kind: 'git',
      status: 'submitting'
    }
    expect(
      reduceProjectSelector(slice, { type: 'submit-add-error', message: 'not a git repo' })
    ).toEqual({
      view: 'add-form',
      path: '/x',
      kind: 'git',
      status: 'error',
      errorMessage: 'not a git repo'
    })
  })

  it('submit-add-error is a no-op outside the add-form view', () => {
    const closed = emptyProjectSelectorSlice()
    expect(reduceProjectSelector(closed, { type: 'submit-add-error', message: 'x' })).toBe(closed)
  })

  it('back-to-list returns a fresh list view from the add-form', () => {
    const slice: ProjectSelectorSlice = {
      view: 'add-form',
      path: '/x',
      kind: 'git',
      status: 'error',
      errorMessage: 'e'
    }
    expect(reduceProjectSelector(slice, { type: 'back-to-list' })).toEqual({
      view: 'open',
      query: '',
      highlightedIndex: 0
    })
  })
})
