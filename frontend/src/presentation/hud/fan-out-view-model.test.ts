import { describe, expect, it } from 'vitest'
import { fanOutViewModel } from './fan-out-view-model'
import { MIN_FANOUT, MAX_FANOUT } from '../../application/fan-out-model'
import type { FanOutSlice } from '../../application/fan-out-model'

describe('fanOutViewModel — closed', () => {
  it('renders nothing when the slice is closed', () => {
    expect(fanOutViewModel({ view: 'closed', repoSelector: null })).toBeNull()
  })
})

const formSlice = (
  overrides: Partial<Extract<FanOutSlice, { view: 'form' }>> = {}
): FanOutSlice => ({
  view: 'form',
  parentId: 'w1',
  fields: { count: 3, agent: 'none', prompt: '' },
  repoSelector: null,
  ...overrides
})

describe('fanOutViewModel — form', () => {
  it('projects the count stepper with min/max from the domain constants', () => {
    const model = fanOutViewModel(formSlice({ fields: { count: 4, agent: 'none', prompt: '' } }))
    if (model?.view !== 'form') throw new Error('expected form')
    expect(model.count).toEqual({ value: 4, min: MIN_FANOUT, max: MAX_FANOUT, enabled: true })
  })

  it('projects agent and prompt field values verbatim', () => {
    const model = fanOutViewModel(
      formSlice({ fields: { count: 3, agent: 'claude', prompt: 'hola' } })
    )
    if (model?.view !== 'form') throw new Error('expected form')
    expect(model.agent.value).toBe('claude')
    expect(model.prompt.value).toBe('hola')
  })

  it('PROMPT is disabled when agent is none, enabled once an agent is chosen', () => {
    const none = fanOutViewModel(formSlice())
    const claude = fanOutViewModel(formSlice({ fields: { count: 3, agent: 'claude', prompt: '' } }))
    if (none?.view !== 'form' || claude?.view !== 'form') throw new Error('expected form')
    expect(none.prompt.enabled).toBe(false)
    expect(claude.prompt.enabled).toBe(true)
  })

  it('submit is disabled while the repo selector is unresolved', () => {
    const model = fanOutViewModel(formSlice({ repoSelector: null }))
    if (model?.view !== 'form') throw new Error('expected form')
    expect(model.submitEnabled).toBe(false)
  })

  it('submit is enabled once the repo is resolved and the count is within bounds', () => {
    const model = fanOutViewModel(formSlice({ repoSelector: 'id:repo-1' }))
    if (model?.view !== 'form') throw new Error('expected form')
    expect(model.submitEnabled).toBe(true)
  })

  it('submit is disabled when the count is out of bounds, even with a resolved repo', () => {
    const tooLow = fanOutViewModel(
      formSlice({
        repoSelector: 'id:repo-1',
        fields: { count: MIN_FANOUT - 1, agent: 'none', prompt: '' }
      })
    )
    const tooHigh = fanOutViewModel(
      formSlice({
        repoSelector: 'id:repo-1',
        fields: { count: MAX_FANOUT + 1, agent: 'none', prompt: '' }
      })
    )
    if (tooLow?.view !== 'form' || tooHigh?.view !== 'form') throw new Error('expected form')
    expect(tooLow.submitEnabled).toBe(false)
    expect(tooHigh.submitEnabled).toBe(false)
  })

  it('carries no error message when the slice has none', () => {
    const model = fanOutViewModel(formSlice())
    if (model?.view !== 'form') throw new Error('expected form')
    expect(model.errorMessage).toBeNull()
  })

  it('passes the slice errorMessage through verbatim', () => {
    const model = fanOutViewModel(formSlice({ errorMessage: 'a repo must be selected' }))
    if (model?.view !== 'form') throw new Error('expected form')
    expect(model.errorMessage).toBe('a repo must be selected')
  })
})

const runningSlice = (
  overrides: Partial<Extract<FanOutSlice, { view: 'running' }>> = {}
): FanOutSlice => ({
  view: 'running',
  parentId: 'w1',
  fields: { count: 5, agent: 'claude', prompt: '' },
  repoSelector: 'id:repo-1',
  batch: [
    { mutationId: 'm1', worktreeId: 'w2', failed: false },
    { mutationId: 'm2', worktreeId: 'w3', failed: false },
    { mutationId: 'm3', worktreeId: 'w4', failed: false },
    { mutationId: 'm4', worktreeId: 'w5', failed: false },
    { mutationId: 'm5', worktreeId: null, failed: false }
  ],
  memberStatus: { w2: 'working', w3: 'working', w4: 'waiting-input', w5: 'idle' },
  ...overrides
})

describe('fanOutViewModel — running', () => {
  it('renders the callout as "fan-out · N × agent"', () => {
    const model = fanOutViewModel(runningSlice())
    if (model?.view !== 'running') throw new Error('expected running')
    expect(model.callout).toBe('fan-out · 5 × claude')
  })

  it('matches the mockup fixture counters: 2 trabajando · 1 esperando · 1 naciendo · 1 listo', () => {
    const model = fanOutViewModel(runningSlice())
    if (model?.view !== 'running') throw new Error('expected running')
    expect(model.counters).toBe('2 trabajando · 1 esperando · 1 naciendo · 1 listo')
  })

  it('appends the failed count only when at least one entry failed', () => {
    const noFailures = fanOutViewModel(runningSlice())
    const withFailure = fanOutViewModel(
      runningSlice({
        batch: [
          { mutationId: 'm1', worktreeId: null, failed: true },
          { mutationId: 'm2', worktreeId: null, failed: false }
        ],
        memberStatus: {}
      })
    )
    if (noFailures?.view !== 'running' || withFailure?.view !== 'running') {
      throw new Error('expected running')
    }
    expect(noFailures.counters).not.toContain('error')
    expect(withFailure.counters).toBe('0 trabajando · 0 esperando · 1 naciendo · 0 listo · 1 error')
  })
})
