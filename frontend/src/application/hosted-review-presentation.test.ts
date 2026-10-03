import { describe, expect, it } from 'vitest'
import {
  authRequiredMessage,
  blockedReasonText,
  reviewKindName,
  reviewPrimaryAction
} from './hosted-review-presentation'
import type { HostedReviewEligibility } from './ports/runtime-gateway'

const eligibility = (over: Partial<HostedReviewEligibility> = {}): HostedReviewEligibility => ({
  provider: 'github',
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

describe('reviewKindName', () => {
  it.each([
    ['github', 'PR'],
    ['gitlab', 'MR'],
    ['gitea', 'PR'],
    ['bitbucket', 'PR'],
    ['azure-devops', 'PR'],
    ['something-new', 'review']
  ])('%s -> %s', (provider, name) => {
    expect(reviewKindName(provider)).toBe(name)
  })
})

describe('reviewPrimaryAction', () => {
  it.each([
    ['commit', 'commit'],
    ['publish', 'publicar'],
    ['push', 'push'],
    ['sync', 'sync'],
    ['authenticate', 'autenticar']
  ])('nextAction %s is labeled %s', (nextAction, label) => {
    const action = reviewPrimaryAction(eligibility({ canCreate: false, nextAction }), false)
    expect(action).toMatchObject({ kind: nextAction, label, disabled: false })
  })

  it('links to the existing review', () => {
    const action = reviewPrimaryAction(
      eligibility({
        canCreate: false,
        nextAction: 'open_existing_review',
        review: { number: 7, url: 'https://x/7' }
      }),
      false
    )
    expect(action).toEqual({
      kind: 'open',
      label: 'abrir PR #7',
      disabled: false,
      href: 'https://x/7'
    })
  })

  it('offers creation with a provider-neutral label', () => {
    expect(reviewPrimaryAction(eligibility({ provider: 'gitlab' }), false)).toMatchObject({
      kind: 'create',
      label: 'crear MR',
      disabled: false
    })
    expect(reviewPrimaryAction(eligibility({ provider: 'other' }), false).label).toBe(
      'crear review'
    )
  })

  it('disables creation while in flight or when blocked without a next action', () => {
    expect(reviewPrimaryAction(eligibility(), true)).toMatchObject({
      label: 'creando…',
      disabled: true
    })
    expect(
      reviewPrimaryAction(eligibility({ canCreate: false, blockedReason: 'default_branch' }), false)
    ).toMatchObject({ kind: 'create', disabled: true })
  })
})

describe('copy', () => {
  it('explains auth for Docker and native hosts', () => {
    expect(authRequiredMessage()).toContain('GH_TOKEN')
    expect(authRequiredMessage()).toContain('GITLAB_TOKEN')
    expect(authRequiredMessage()).toContain('gh auth login')
    expect(authRequiredMessage()).toContain('glab auth login')
  })

  it('maps known blocked reasons and falls back to null', () => {
    expect(blockedReasonText('default_branch')).toMatch(/rama por defecto/)
    expect(blockedReasonText('base_not_on_remote')).toMatch(/base/)
    expect(blockedReasonText(null)).toBeNull()
    expect(blockedReasonText('brand_new_reason')).toBe('brand_new_reason')
  })
})
