import { describe, expect, it } from 'vitest'
import { spawnViewModel } from './spawn-view-model'
import { emptySpawnMenuSlice } from '../../application/spawn-menu-model'
import type { SpawnMenuSlice } from '../../application/spawn-menu-model'
import { emptyWorktreeGraph } from '../../domain/worktree-graph/types'
import type { WorktreeGraph, WorktreeNode } from '../../domain/worktree-graph/types'
import { inertActivity } from '../../domain/worktree-graph/node-activity'

const node = (id: string, branch: string): WorktreeNode => ({
  id,
  branch,
  path: `/tmp/${id}`,
  status: 'clean',
  isMain: false,
  kind: 'worktree',
  parentId: null,
  childIds: [],
  activity: inertActivity()
})

const graphWith = (n: WorktreeNode): WorktreeGraph => ({
  nodes: new Map([[n.id, n]]),
  edges: [],
  rootIds: [n.id]
})

describe('spawnViewModel — closed', () => {
  it('renders nothing when the slice is closed', () => {
    expect(spawnViewModel(emptySpawnMenuSlice(), emptyWorktreeGraph())).toBeNull()
  })
})

describe('spawnViewModel — radial', () => {
  const radial: SpawnMenuSlice = { view: 'radial', nodeId: 'a', repoSelector: null }

  it('shows exactly the spawn chip active, the rest disabled (SPAWN-002 scope)', () => {
    const model = spawnViewModel(radial, emptyWorktreeGraph())
    expect(model?.view).toBe('radial')
    if (model?.view !== 'radial') throw new Error('expected radial')
    expect(model.chips).toEqual([
      { key: 's', label: 'spawn hijo', tone: 'active' },
      { key: 'F', label: 'fan-out', tone: 'disabled' },
      { key: 't', label: 'terminal', tone: 'disabled' },
      { key: 'a', label: 'archivar', tone: 'disabled' }
    ])
  })
})

const formSlice = (
  overrides: Partial<Extract<SpawnMenuSlice, { view: 'form' }>> = {}
): SpawnMenuSlice => ({
  view: 'form',
  parentId: null,
  fields: { name: '', baseBranch: '', agent: 'none', prompt: '' },
  status: 'idle',
  repoSelector: null,
  ...overrides
})

describe('spawnViewModel — form', () => {
  it('titles "desde raíz" when rootless (no parent)', () => {
    const model = spawnViewModel(formSlice(), emptyWorktreeGraph())
    expect(model?.view).toBe('form')
    if (model?.view !== 'form') throw new Error('expected form')
    expect(model.title).toBe('spawn hijo · desde raíz')
  })

  it('titles "desde <short branch>" when spawning from a selected parent', () => {
    const graph = graphWith(node('p1', 'refs/heads/auth-retry'))
    const model = spawnViewModel(formSlice({ parentId: 'p1' }), graph)
    if (model?.view !== 'form') throw new Error('expected form')
    expect(model.title).toBe('spawn hijo · desde auth-retry')
  })

  it('projects field values verbatim', () => {
    const model = spawnViewModel(
      formSlice({
        fields: { name: 'auth-retry-tests', baseBranch: 'develop', agent: 'claude', prompt: 'hola' }
      }),
      emptyWorktreeGraph()
    )
    if (model?.view !== 'form') throw new Error('expected form')
    expect(model.name.value).toBe('auth-retry-tests')
    expect(model.baseBranch.value).toBe('develop')
    expect(model.agent.value).toBe('claude')
    expect(model.prompt.value).toBe('hola')
  })

  it('PROMPT is disabled when agent is none, enabled when an agent is chosen', () => {
    const none = spawnViewModel(formSlice(), emptyWorktreeGraph())
    const claude = spawnViewModel(
      formSlice({ fields: { name: '', baseBranch: '', agent: 'claude', prompt: '' } }),
      emptyWorktreeGraph()
    )
    if (none?.view !== 'form' || claude?.view !== 'form') throw new Error('expected form')
    expect(none.prompt.enabled).toBe(false)
    expect(claude.prompt.enabled).toBe(true)
  })

  it('submit is disabled with an empty name, enabled once a name is present', () => {
    const empty = spawnViewModel(formSlice(), emptyWorktreeGraph())
    const named = spawnViewModel(
      formSlice({ fields: { name: 'x', baseBranch: '', agent: 'none', prompt: '' } }),
      emptyWorktreeGraph()
    )
    if (empty?.view !== 'form' || named?.view !== 'form') throw new Error('expected form')
    expect(empty.submitEnabled).toBe(false)
    expect(named.submitEnabled).toBe(true)
  })

  it('a name that is only whitespace does not enable submit', () => {
    const model = spawnViewModel(
      formSlice({ fields: { name: '   ', baseBranch: '', agent: 'none', prompt: '' } }),
      emptyWorktreeGraph()
    )
    if (model?.view !== 'form') throw new Error('expected form')
    expect(model.submitEnabled).toBe(false)
  })

  it('submitting status disables every field and submit, and shows a submitting label', () => {
    const model = spawnViewModel(
      formSlice({
        fields: { name: 'x', baseBranch: '', agent: 'claude', prompt: '' },
        status: 'submitting'
      }),
      emptyWorktreeGraph()
    )
    if (model?.view !== 'form') throw new Error('expected form')
    expect(model.name.enabled).toBe(false)
    expect(model.agent.enabled).toBe(false)
    expect(model.baseBranch.enabled).toBe(false)
    expect(model.prompt.enabled).toBe(false)
    expect(model.submitEnabled).toBe(false)
    expect(model.submitLabel).toBe('creando…')
  })

  it('error status surfaces the message and keeps the form usable', () => {
    const model = spawnViewModel(
      formSlice({
        fields: { name: 'x', baseBranch: '', agent: 'none', prompt: '' },
        status: 'error',
        errorMessage: 'la conexión falló'
      }),
      emptyWorktreeGraph()
    )
    if (model?.view !== 'form') throw new Error('expected form')
    expect(model.errorMessage).toBe('la conexión falló')
    expect(model.name.enabled).toBe(true)
    expect(model.submitEnabled).toBe(true)
  })

  it('idle status with no error carries no error message', () => {
    const model = spawnViewModel(formSlice(), emptyWorktreeGraph())
    if (model?.view !== 'form') throw new Error('expected form')
    expect(model.errorMessage).toBeNull()
  })
})
