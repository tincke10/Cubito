import { describe, expect, it } from 'vitest'
import { sourceControlModel } from './source-control-view-model'
import type { SourceControlView } from '../../application/source-control-flow'

const ready = (
  over: Partial<Extract<SourceControlView, { phase: 'ready' }>> = {}
): SourceControlView => ({
  phase: 'ready',
  nodeId: 'r::/w',
  branch: 'feat',
  stageStates: new Map(),
  stagedCount: 2,
  hasUpstream: true,
  ahead: 1,
  behind: 0,
  message: 'feat: x',
  busy: null,
  notice: null,
  canCommit: true,
  canPush: true,
  ...over
})

describe('sourceControlModel', () => {
  it('is hidden when the flow is hidden', () => {
    expect(sourceControlModel({ phase: 'hidden' }).visible).toBe(false)
  })

  it('summarises staged files and upstream counters', () => {
    const model = sourceControlModel(ready())
    expect(model.statusLine).toBe('2 en stage · ↑1 ↓0')
    expect(model.commitDisabled).toBe(false)
    expect(model.pushLabel).toBe('push')
  })

  it('offers to publish when there is no upstream', () => {
    const model = sourceControlModel(ready({ hasUpstream: false, ahead: 0 }))
    expect(model.statusLine).toBe('2 en stage · sin upstream')
    expect(model.pushLabel).toBe('publicar rama')
  })

  it('mirrors the flow gating and shows busy copy', () => {
    const model = sourceControlModel(ready({ busy: 'commit', canCommit: false, canPush: false }))
    expect(model.commitLabel).toBe('commiteando…')
    expect(model.commitDisabled).toBe(true)
    expect(model.pushDisabled).toBe(true)
    expect(model.messageDisabled).toBe(true)
  })

  it('carries the notice through', () => {
    const notice = { tone: 'error', text: 'boom' } as const
    expect(sourceControlModel(ready({ notice })).notice).toEqual(notice)
  })
})
