import type { HostedReviewEligibility } from './ports/runtime-gateway'
import type { MessageKey } from './i18n/messages/en'
import { t } from './i18n/translate'

export const authRequiredMessage = (): string => t('review.authRequired')

/** Short noun per provider; an unknown provider stays neutral instead of guessing PR vs MR. */
export function reviewKindName(provider: string): string {
  if (provider === 'gitlab') return 'MR'
  if (['github', 'gitea', 'bitbucket', 'azure-devops'].includes(provider)) return 'PR'
  return 'review'
}

const BLOCKED_COPY_KEYS: Record<string, MessageKey> = {
  dirty: 'review.blocked.dirty',
  detached_head: 'review.blocked.detached_head',
  default_branch: 'review.blocked.default_branch',
  no_upstream: 'review.blocked.no_upstream',
  needs_push: 'review.blocked.needs_push',
  needs_sync: 'review.blocked.needs_sync',
  auth_required: 'review.authRequired',
  fork_head_unsupported: 'review.blocked.fork_head_unsupported',
  unsupported_provider: 'review.blocked.unsupported_provider',
  existing_review: 'review.blocked.existing_review',
  base_not_on_remote: 'review.blocked.base_not_on_remote'
}

/** Unknown reasons from a newer host are shown verbatim rather than hidden. */
export function blockedReasonText(reason: string | null): string | null {
  if (reason === null) return null
  const key = BLOCKED_COPY_KEYS[reason]
  return key === undefined ? reason : t(key)
}

export type ReviewPrimaryAction = {
  kind: 'commit' | 'publish' | 'push' | 'sync' | 'authenticate' | 'open' | 'create'
  label: string
  disabled: boolean
  /** Set for `open`: rendered as an <a target=_blank>, not a button. */
  href?: string
}

/** The single next step toward a review, labeled by the host's `nextAction`. */
export function reviewPrimaryAction(
  eligibility: HostedReviewEligibility,
  creating: boolean
): ReviewPrimaryAction {
  const kind = reviewKindName(eligibility.provider)
  switch (eligibility.nextAction) {
    case 'commit':
      return { kind: 'commit', label: 'commit', disabled: false }
    case 'publish':
      return { kind: 'publish', label: t('review.publish'), disabled: false }
    case 'push':
      return { kind: 'push', label: 'push', disabled: false }
    case 'sync':
      return { kind: 'sync', label: 'sync', disabled: false }
    case 'authenticate':
      return { kind: 'authenticate', label: t('review.authenticate'), disabled: false }
    case 'open_existing_review': {
      const review = eligibility.review
      if (review) {
        const suffix = review.number === undefined ? '' : ` #${review.number}`
        return {
          kind: 'open',
          label: t('review.open', { kind, number: suffix }),
          disabled: false,
          href: review.url
        }
      }
      break
    }
    case null:
    default:
      break
  }
  return {
    kind: 'create',
    label: creating ? t('review.creating') : t('review.create', { kind }),
    disabled: creating || !eligibility.canCreate
  }
}
