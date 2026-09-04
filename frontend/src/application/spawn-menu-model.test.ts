import { describe, expect, it } from 'vitest'
import { emptySpawnMenuSlice, reduceSpawnMenu, toCreateWorktreeInput } from './spawn-menu-model'
import type { SpawnFormFields, SpawnMenuSlice } from './spawn-menu-model'

const formFields = (overrides: Partial<SpawnFormFields> = {}): SpawnFormFields => ({
  name: '',
  baseBranch: '',
  agent: 'none',
  prompt: '',
  ...overrides
})

describe('reduceSpawnMenu', () => {
  it('emptySpawnMenuSlice starts closed with no cached repo selector', () => {
    expect(emptySpawnMenuSlice()).toEqual({ view: 'closed', repoSelector: null })
  })

  it('open-for-node opens the radial anchored to the node, preserving repoSelector', () => {
    const slice: SpawnMenuSlice = { view: 'closed', repoSelector: 'id:repo-1' }
    const next = reduceSpawnMenu(slice, { type: 'open-for-node', nodeId: 'w1' })
    expect(next).toEqual({ view: 'radial', nodeId: 'w1', repoSelector: 'id:repo-1' })
  })

  it('open-rootless opens the form directly with parentId null and empty fields', () => {
    const slice = emptySpawnMenuSlice()
    const next = reduceSpawnMenu(slice, { type: 'open-rootless' })
    expect(next).toEqual({
      view: 'form',
      parentId: null,
      fields: formFields(),
      status: 'idle',
      repoSelector: null
    })
  })

  it('radial-select transitions radial to form with the radial node as parent', () => {
    const slice: SpawnMenuSlice = { view: 'radial', nodeId: 'w1', repoSelector: 'id:repo-1' }
    const next = reduceSpawnMenu(slice, { type: 'radial-select' })
    expect(next).toEqual({
      view: 'form',
      parentId: 'w1',
      fields: formFields(),
      status: 'idle',
      repoSelector: 'id:repo-1'
    })
  })

  it('radial-select is a no-op outside the radial view', () => {
    const slice = emptySpawnMenuSlice()
    expect(reduceSpawnMenu(slice, { type: 'radial-select' })).toBe(slice)
  })

  it('update-field updates one field, leaving the others untouched', () => {
    const slice: SpawnMenuSlice = {
      view: 'form',
      parentId: null,
      fields: formFields({ name: 'cubito/x' }),
      status: 'idle',
      repoSelector: null
    }
    const next = reduceSpawnMenu(slice, {
      type: 'update-field',
      field: 'baseBranch',
      value: 'develop'
    })
    expect(next).toEqual({
      view: 'form',
      parentId: null,
      fields: formFields({ name: 'cubito/x', baseBranch: 'develop' }),
      status: 'idle',
      repoSelector: null
    })
  })

  it('update-field is a no-op outside the form view', () => {
    const slice: SpawnMenuSlice = { view: 'radial', nodeId: 'w1', repoSelector: null }
    expect(reduceSpawnMenu(slice, { type: 'update-field', field: 'name', value: 'x' })).toBe(slice)
  })

  it('set-repo-selector caches the selector regardless of the current view', () => {
    const closed = emptySpawnMenuSlice()
    expect(
      reduceSpawnMenu(closed, { type: 'set-repo-selector', repoSelector: 'id:repo-1' })
    ).toEqual({
      view: 'closed',
      repoSelector: 'id:repo-1'
    })

    const radial: SpawnMenuSlice = { view: 'radial', nodeId: 'w1', repoSelector: null }
    expect(
      reduceSpawnMenu(radial, { type: 'set-repo-selector', repoSelector: 'id:repo-1' })
    ).toEqual({
      view: 'radial',
      nodeId: 'w1',
      repoSelector: 'id:repo-1'
    })
  })

  it('submit moves an idle form to submitting and clears any error', () => {
    const slice: SpawnMenuSlice = {
      view: 'form',
      parentId: null,
      fields: formFields({ name: 'x' }),
      status: 'error',
      errorMessage: 'boom',
      repoSelector: 'id:repo-1'
    }
    const next = reduceSpawnMenu(slice, { type: 'submit' })
    expect(next).toEqual({
      view: 'form',
      parentId: null,
      fields: formFields({ name: 'x' }),
      status: 'submitting',
      repoSelector: 'id:repo-1'
    })
    expect('errorMessage' in (next as { errorMessage?: string })).toBe(false)
  })

  it('submit is a no-op when already submitting', () => {
    const slice: SpawnMenuSlice = {
      view: 'form',
      parentId: null,
      fields: formFields(),
      status: 'submitting',
      repoSelector: null
    }
    expect(reduceSpawnMenu(slice, { type: 'submit' })).toBe(slice)
  })

  it('submit is a no-op outside the form view', () => {
    const slice = emptySpawnMenuSlice()
    expect(reduceSpawnMenu(slice, { type: 'submit' })).toBe(slice)
  })

  it('submit-ok closes the menu, preserving the cached repoSelector', () => {
    const slice: SpawnMenuSlice = {
      view: 'form',
      parentId: 'w1',
      fields: formFields({ name: 'x' }),
      status: 'submitting',
      repoSelector: 'id:repo-1'
    }
    expect(reduceSpawnMenu(slice, { type: 'submit-ok' })).toEqual({
      view: 'closed',
      repoSelector: 'id:repo-1'
    })
  })

  it('submit-error moves a submitting form to error, keeping field values intact', () => {
    const slice: SpawnMenuSlice = {
      view: 'form',
      parentId: null,
      fields: formFields({ name: 'x' }),
      status: 'submitting',
      repoSelector: null
    }
    const next = reduceSpawnMenu(slice, { type: 'submit-error', message: 'network down' })
    expect(next).toEqual({
      view: 'form',
      parentId: null,
      fields: formFields({ name: 'x' }),
      status: 'error',
      errorMessage: 'network down',
      repoSelector: null
    })
  })

  it('submit-error is a no-op outside the form view', () => {
    const slice = emptySpawnMenuSlice()
    expect(reduceSpawnMenu(slice, { type: 'submit-error', message: 'x' })).toBe(slice)
  })

  it('cancel closes from the radial view', () => {
    const slice: SpawnMenuSlice = { view: 'radial', nodeId: 'w1', repoSelector: 'id:repo-1' }
    expect(reduceSpawnMenu(slice, { type: 'cancel' })).toEqual({
      view: 'closed',
      repoSelector: 'id:repo-1'
    })
  })

  it('cancel closes from the form view, discarding field values', () => {
    const slice: SpawnMenuSlice = {
      view: 'form',
      parentId: null,
      fields: formFields({ name: 'x' }),
      status: 'error',
      errorMessage: 'boom',
      repoSelector: null
    }
    expect(reduceSpawnMenu(slice, { type: 'cancel' })).toEqual({
      view: 'closed',
      repoSelector: null
    })
  })

  it('cancel is idempotent when already closed', () => {
    const slice = emptySpawnMenuSlice()
    expect(reduceSpawnMenu(slice, { type: 'cancel' })).toEqual({
      view: 'closed',
      repoSelector: null
    })
  })
})

describe('toCreateWorktreeInput', () => {
  it('builds the full set of params for a child spawn with an agent and prompt', () => {
    const fields = formFields({
      name: 'cubito/x',
      baseBranch: 'develop',
      agent: 'claude',
      prompt: 'fix the bug'
    })
    expect(toCreateWorktreeInput(fields, 'w1', 'id:repo-1')).toStrictEqual({
      repo: 'id:repo-1',
      name: 'cubito/x',
      baseBranch: 'develop',
      startupAgent: 'claude',
      startupPrompt: 'fix the bug',
      parentWorktree: 'w1'
    })
  })

  it('builds the minimal set of params for a rootless spawn with no agent', () => {
    const fields = formFields({ name: 'cubito/x' })
    expect(toCreateWorktreeInput(fields, null, 'id:repo-1')).toStrictEqual({
      repo: 'id:repo-1',
      name: 'cubito/x'
    })
  })

  it('omits baseBranch when empty', () => {
    const fields = formFields({ name: 'x', baseBranch: '' })
    expect(toCreateWorktreeInput(fields, null, 'id:repo-1')).toStrictEqual({
      repo: 'id:repo-1',
      name: 'x'
    })
  })

  it('omits name when empty', () => {
    const fields = formFields({ name: '' })
    expect(toCreateWorktreeInput(fields, null, 'id:repo-1')).toStrictEqual({ repo: 'id:repo-1' })
  })

  it('omits startupAgent and startupPrompt when agent is none, even if a prompt was typed', () => {
    const fields = formFields({ name: 'x', agent: 'none', prompt: 'ignored' })
    expect(toCreateWorktreeInput(fields, null, 'id:repo-1')).toStrictEqual({
      repo: 'id:repo-1',
      name: 'x'
    })
  })

  it('sets startupAgent without startupPrompt when an agent is chosen but no prompt is typed', () => {
    const fields = formFields({ name: 'x', agent: 'claude', prompt: '' })
    expect(toCreateWorktreeInput(fields, null, 'id:repo-1')).toStrictEqual({
      repo: 'id:repo-1',
      name: 'x',
      startupAgent: 'claude'
    })
  })

  it('omits parentWorktree for a rootless spawn and sets it for a child spawn', () => {
    const fields = formFields({ name: 'x' })
    expect(toCreateWorktreeInput(fields, null, 'id:repo-1')).not.toHaveProperty('parentWorktree')
    expect(toCreateWorktreeInput(fields, 'w9', 'id:repo-1')).toMatchObject({ parentWorktree: 'w9' })
  })

  it('always sets repo from the resolved selector', () => {
    const fields = formFields({ name: 'x' })
    expect(toCreateWorktreeInput(fields, null, 'id:repo-2').repo).toBe('id:repo-2')
  })
})
