import { describe, expect, it } from 'vitest'
import { worktreeDeletePanelModel } from './worktree-delete-view-model'
import type { WorktreeDeleteView } from '../../application/worktree-delete-flow'

const open = (
  over: Partial<Extract<WorktreeDeleteView, { phase: 'open' }>> = {}
): WorktreeDeleteView => ({
  phase: 'open',
  nodeId: 'r::/a',
  branch: 'feat-a',
  blocked: false,
  dirtyFiles: 3,
  liveTerminals: 2,
  agentStatus: 'working',
  children: ['b', 'c'],
  removing: false,
  error: null,
  forceOffered: false,
  ...over
})

describe('worktree delete panel model', () => {
  it('is hidden when idle', () => {
    expect(worktreeDeletePanelModel({ phase: 'idle' }).visible).toBe(false)
  })

  it('explains the primary block and offers no action', () => {
    const model = worktreeDeletePanelModel(open({ blocked: true, branch: 'main' }))
    expect(model.showAction).toBe(false)
    expect(model.title).toContain('principal')
  })

  it('lists dirty files, terminals, agent and children', () => {
    const model = worktreeDeletePanelModel(open())
    expect(model.lines).toEqual([
      '3 archivos con cambios sin commitear',
      '2 terminales vivas se van a cerrar',
      'hay un agente activo (working)',
      'tiene 2 worktrees hijos: b, c'
    ])
    expect(model.actionLabels.idle).toBe('eliminar')
  })

  it('warns when the git state is unknown and while loading', () => {
    expect(worktreeDeletePanelModel(open({ dirtyFiles: 'unknown' })).lines[0]).toMatch(/no se pudo/)
    expect(worktreeDeletePanelModel(open({ dirtyFiles: 'loading' })).lines[0]).toMatch(/revisando/)
  })

  it('switches to forzar copy after a failed attempt and shows the error', () => {
    const model = worktreeDeletePanelModel(open({ forceOffered: true, error: 'dirty' }))
    expect(model.actionLabels.idle).toBe('forzar eliminación')
    expect(model.error).toBe('dirty')
  })

  it('disables cancel and marks busy while removing', () => {
    const model = worktreeDeletePanelModel(open({ removing: true }))
    expect(model.busy).toBe(true)
    expect(model.cancelDisabled).toBe(true)
  })
})
