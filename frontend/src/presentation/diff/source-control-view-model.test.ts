import { describe, expect, it } from 'vitest'
import type { HostedReviewEligibility } from '../../application/ports/runtime-gateway'
import { sourceControlModel } from './source-control-view-model'
import type { SourceControlView } from '../../application/source-control-flow'

const eligibility = (over: Partial<HostedReviewEligibility> = {}): HostedReviewEligibility => ({
  provider: 'gitlab',
  review: null,
  canCreate: true,
  blockedReason: null,
  nextAction: null,
  defaultBaseRef: 'main',
  head: 'feat',
  title: 'T',
  body: 'B',
  ...over
})
const withReview = (
  over: Partial<
    Extract<Extract<SourceControlView, { phase: 'ready' }>['review'], { phase: 'ready' }>
  > = {},
  e: Partial<HostedReviewEligibility> = {}
): SourceControlView =>
  ready({
    review: {
      phase: 'ready',
      eligibility: eligibility(e),
      title: 'T',
      body: 'B',
      draft: false,
      touched: false,
      creating: false,
      result: null,
      ...over
    }
  })

it('has no review section when the host did not answer', () => {
  expect(sourceControlModel(ready()).review).toBeNull()
})

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
  review: { phase: 'unavailable' },
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
    const notice = { tone: 'error', message: { lead: 'boom', detail: null } } as const
    expect(sourceControlModel(ready({ notice })).notice).toEqual(notice)
  })

  describe('review section', () => {
    it('shows the create form with a provider-neutral label', () => {
      const review = sourceControlModel(withReview()).review!
      expect(review.primary).toMatchObject({ kind: 'create', label: 'crear MR', disabled: false })
      expect(review.showForm).toBe(true)
      expect(review.title).toBe('T')
      expect(review.showDraft).toBe(true)
    })

    it('hides the form and draft toggle when the next step is not creating', () => {
      const review = sourceControlModel(
        withReview({}, { canCreate: false, nextAction: 'push' })
      ).review!
      expect(review.showForm).toBe(false)
      expect(review.primary.label).toBe('push')
    })

    it('disables creation without a title and hides draft for bitbucket', () => {
      expect(sourceControlModel(withReview({ title: ' ' })).review!.primary.disabled).toBe(true)
      expect(sourceControlModel(withReview({}, { provider: 'bitbucket' })).review!.showDraft).toBe(
        false
      )
    })

    it('explains why creation is blocked and carries the result link', () => {
      const review = sourceControlModel(
        withReview(
          {
            result: {
              tone: 'ok',
              message: { lead: 'MR #2 creado', detail: null },
              href: 'https://x/2'
            }
          },
          { canCreate: false, blockedReason: 'default_branch' }
        )
      ).review!
      expect(review.blockedText).toMatch(/rama por defecto/)
      expect(review.result).toEqual({
        tone: 'ok',
        message: { lead: 'MR #2 creado', detail: null },
        href: 'https://x/2'
      })
    })
  })
})
