import { describe, expect, it, vi } from 'vitest'
import { createHostedReviewMethods } from './orcad-hosted-review-gateway'
import type { RpcCaller } from './orcad-gateway'

const frame = (result: unknown) => ({
  id: 'x',
  ok: true as const,
  result,
  _meta: { runtimeId: 'rt' }
})

const input = {
  repo: 'id:r',
  worktree: 'r::/w',
  branch: 'feat',
  base: 'main',
  hasUncommittedChanges: false,
  hasUpstream: true,
  ahead: 1,
  behind: 0
}

describe('createHostedReviewMethods — eligibility', () => {
  it('forwards the git state and projects the opaque eligibility reply', async () => {
    const call = vi.fn<RpcCaller>(async () =>
      frame({
        provider: 'gitlab',
        review: null,
        canCreate: true,
        blockedReason: null,
        nextAction: null,
        defaultBaseRef: 'main',
        head: 'feat',
        title: 'T',
        body: 'B',
        extra: 'ignored'
      })
    )
    const result = await createHostedReviewMethods({ call }).hostedReviewEligibility(input)
    expect(call).toHaveBeenCalledWith('hostedReview.getCreationEligibility', input)
    expect(result).toEqual({
      provider: 'gitlab',
      review: null,
      canCreate: true,
      blockedReason: null,
      nextAction: null,
      defaultBaseRef: 'main',
      head: 'feat',
      title: 'T',
      body: 'B'
    })
  })

  it('keeps an existing review link and tolerates missing optional fields', async () => {
    const call = vi.fn<RpcCaller>(async () =>
      frame({
        provider: 'github',
        review: { number: 4, url: 'https://x/pull/4' },
        canCreate: false,
        blockedReason: 'existing_review',
        nextAction: 'open_existing_review'
      })
    )
    const result = await createHostedReviewMethods({ call }).hostedReviewEligibility(input)
    expect(result.review).toEqual({ number: 4, url: 'https://x/pull/4' })
    expect(result.nextAction).toBe('open_existing_review')
    expect(result.title).toBeNull()
  })

  it('rejects a reply without a provider', async () => {
    const call = vi.fn<RpcCaller>(async () => frame({}))
    await expect(
      createHostedReviewMethods({ call }).hostedReviewEligibility(input)
    ).rejects.toThrow(/hostedReview/)
  })
})

describe('createHostedReviewMethods — create', () => {
  const create = {
    repo: 'id:r',
    worktree: 'r::/w',
    provider: 'some-future-provider',
    base: 'main',
    head: 'feat',
    title: 'T',
    body: 'B',
    draft: true
  }

  it('passes the provider through opaquely and projects success', async () => {
    const call = vi.fn<RpcCaller>(async () => frame({ ok: true, number: 9, url: 'https://x/9' }))
    const result = await createHostedReviewMethods({ call }).hostedReviewCreate(create)
    expect(call).toHaveBeenCalledWith('hostedReview.create', create)
    expect(result).toEqual({ ok: true, number: 9, url: 'https://x/9' })
  })

  it('returns the failure code, message and existing review without throwing', async () => {
    const call = vi.fn<RpcCaller>(async () =>
      frame({
        ok: false,
        code: 'already_exists',
        error: 'exists',
        existingReview: { number: 3, url: 'https://x/3' }
      })
    )
    await expect(createHostedReviewMethods({ call }).hostedReviewCreate(create)).resolves.toEqual({
      ok: false,
      code: 'already_exists',
      error: 'exists',
      existingReview: { number: 3, url: 'https://x/3' }
    })
  })

  it('maps an unknown shape to an unknown failure', async () => {
    const call = vi.fn<RpcCaller>(async () => frame(null))
    await expect(
      createHostedReviewMethods({ call }).hostedReviewCreate(create)
    ).resolves.toMatchObject({
      ok: false,
      code: 'unknown'
    })
  })
})
