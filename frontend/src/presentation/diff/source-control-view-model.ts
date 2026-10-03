import type { ReviewResult, SourceControlView } from '../../application/source-control-flow'
import {
  blockedReasonText,
  reviewPrimaryAction
} from '../../application/hosted-review-presentation'
import type { ReviewPrimaryAction } from '../../application/hosted-review-presentation'
import { t } from '../../application/i18n/translate'

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

const hiddenModel = (): SourceControlModel => ({
  visible: false,
  statusLine: '',
  message: '',
  commitLabel: t('sourceControl.commit'),
  commitDisabled: true,
  pushLabel: t('sourceControl.push'),
  pushDisabled: true,
  messageDisabled: true,
  notice: null,
  review: null
})

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

/** Pure projection of the source-control flow into composer copy (localized). */
export function sourceControlModel(view: SourceControlView): SourceControlModel {
  if (view.phase === 'hidden') return hiddenModel()
  const sync = view.hasUpstream ? `↑${view.ahead} ↓${view.behind}` : t('sourceControl.noUpstream')
  return {
    visible: true,
    statusLine: t('sourceControl.status', { count: view.stagedCount, sync }),
    message: view.message,
    commitLabel: view.busy === 'commit' ? t('sourceControl.committing') : t('sourceControl.commit'),
    commitDisabled: !view.canCommit,
    pushLabel:
      view.busy === 'push'
        ? t('sourceControl.pushing')
        : view.hasUpstream
          ? t('sourceControl.push')
          : t('sourceControl.publishBranch'),
    pushDisabled: !view.canPush,
    messageDisabled: view.busy !== null,
    notice: view.notice,
    review: reviewModel(view)
  }
}
