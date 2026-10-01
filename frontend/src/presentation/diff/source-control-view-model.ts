import type { ReviewResult, SourceControlView } from '../../application/source-control-flow'
import {
  blockedReasonText,
  reviewPrimaryAction
} from '../../application/hosted-review-presentation'
import type { ReviewPrimaryAction } from '../../application/hosted-review-presentation'

export type ReviewModel = {
  primary: ReviewPrimaryAction
  /** Title/body/draft inputs exist only while the next step is creating the review. */
  showForm: boolean
  showDraft: boolean
  title: string
  body: string
  draft: boolean
  blockedText: string | null
  result: ReviewResult | null
}

export type SourceControlModel = {
  visible: boolean
  statusLine: string
  message: string
  commitLabel: string
  commitDisabled: boolean
  pushLabel: string
  pushDisabled: boolean
  messageDisabled: boolean
  notice: { tone: 'ok' | 'error'; text: string } | null
  review: ReviewModel | null
}

const HIDDEN: SourceControlModel = {
  visible: false,
  statusLine: '',
  message: '',
  commitLabel: 'commit',
  commitDisabled: true,
  pushLabel: 'push',
  pushDisabled: true,
  messageDisabled: true,
  notice: null,
  review: null
}

function reviewModel(view: Extract<SourceControlView, { phase: 'ready' }>): ReviewModel | null {
  const { review } = view
  if (review.phase !== 'ready') return null
  const primary = reviewPrimaryAction(review.eligibility, review.creating)
  const isCreate = primary.kind === 'create'
  return {
    primary: isCreate && review.title.trim() === '' ? { ...primary, disabled: true } : primary,
    showForm: isCreate && review.eligibility.canCreate,
    // Why: Bitbucket Cloud has no draft pull requests; offering the toggle would publish a live one.
    showDraft: review.eligibility.provider !== 'bitbucket',
    title: review.title,
    body: review.body,
    draft: review.draft,
    blockedText: review.eligibility.canCreate
      ? null
      : blockedReasonText(review.eligibility.blockedReason),
    result: review.result
  }
}

/** Pure projection of the source-control flow into composer copy (Spanish, like the HUD). */
export function sourceControlModel(view: SourceControlView): SourceControlModel {
  if (view.phase === 'hidden') return HIDDEN
  const sync = view.hasUpstream ? `↑${view.ahead} ↓${view.behind}` : 'sin upstream'
  return {
    visible: true,
    statusLine: `${view.stagedCount} en stage · ${sync}`,
    message: view.message,
    commitLabel: view.busy === 'commit' ? 'commiteando…' : 'commit',
    commitDisabled: !view.canCommit,
    pushLabel: view.busy === 'push' ? 'pusheando…' : view.hasUpstream ? 'push' : 'publicar rama',
    pushDisabled: !view.canPush,
    messageDisabled: view.busy !== null,
    notice: view.notice,
    review: reviewModel(view)
  }
}
