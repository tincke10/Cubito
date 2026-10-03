import type { SourceControlModel } from './source-control-view-model'
import { t } from '../../application/i18n/translate'

export type SourceControlComposerHandle = {
  readonly root: HTMLElement
  apply(model: SourceControlModel): void
  onMessageChange(cb: (message: string) => void): void
  onCommit(cb: () => void): void
  onPush(cb: () => void): void
  onReviewForm(cb: (form: { title?: string; body?: string; draft?: boolean }) => void): void
  onReviewPrimary(cb: () => void): void
  dispose(): void
}

/** Commit composer under the diff rail: staged summary, message box, commit + push, last result. */
export function createSourceControlComposer(doc: Document = document): SourceControlComposerHandle {
  const root = doc.createElement('div')
  root.className = 'cubito-source-control'
  const status = doc.createElement('div')
  status.className = 'cubito-source-control__status'
  const message = doc.createElement('textarea')
  message.className = 'cubito-source-control__message'
  message.placeholder = t('sourceControl.commitPlaceholder')
  message.rows = 3
  const actions = doc.createElement('div')
  actions.className = 'cubito-source-control__actions'
  const commit = doc.createElement('button')
  commit.type = 'button'
  commit.className = 'cubito-source-control__button'
  const push = doc.createElement('button')
  push.type = 'button'
  push.className = 'cubito-source-control__button'
  const notice = doc.createElement('div')
  notice.className = 'cubito-source-control__notice'
  actions.appendChild(commit)
  actions.appendChild(push)
  root.appendChild(status)
  root.appendChild(message)
  root.appendChild(actions)
  root.appendChild(notice)

  const review = doc.createElement('div')
  review.className = 'cubito-source-control__review'
  const reviewTitle = doc.createElement('input')
  reviewTitle.type = 'text'
  reviewTitle.className = 'cubito-source-control__review-title'
  reviewTitle.placeholder = t('sourceControl.reviewTitlePlaceholder')
  const reviewBody = doc.createElement('textarea')
  reviewBody.className = 'cubito-source-control__review-body'
  reviewBody.placeholder = t('sourceControl.reviewBodyPlaceholder')
  reviewBody.rows = 3
  const draftRow = doc.createElement('label')
  draftRow.className = 'cubito-source-control__draft'
  const draft = doc.createElement('input')
  draft.type = 'checkbox'
  const draftText = doc.createElement('span')
  draftText.textContent = t('sourceControl.draft')
  draftRow.appendChild(draft)
  draftRow.appendChild(draftText)
  const reviewForm = doc.createElement('div')
  reviewForm.className = 'cubito-source-control__review-form'
  reviewForm.appendChild(reviewTitle)
  reviewForm.appendChild(reviewBody)
  reviewForm.appendChild(draftRow)
  const reviewButton = doc.createElement('button')
  reviewButton.type = 'button'
  reviewButton.className = 'cubito-source-control__button cubito-source-control__button--primary'
  const reviewLink = doc.createElement('a')
  reviewLink.className = 'cubito-source-control__button cubito-source-control__button--primary'
  reviewLink.target = '_blank'
  // Why: the review page is third-party content; it must not get window.opener.
  reviewLink.rel = 'noopener noreferrer'
  const reviewBlocked = doc.createElement('div')
  reviewBlocked.className = 'cubito-source-control__status'
  const reviewResult = doc.createElement('div')
  reviewResult.className = 'cubito-source-control__notice'
  const reviewResultLink = doc.createElement('a')
  reviewResultLink.className = 'cubito-source-control__result-link'
  reviewResultLink.target = '_blank'
  reviewResultLink.rel = 'noopener noreferrer'
  reviewResultLink.textContent = t('sourceControl.openResult')
  review.appendChild(reviewForm)
  review.appendChild(reviewBlocked)
  review.appendChild(reviewButton)
  review.appendChild(reviewLink)
  review.appendChild(reviewResult)
  review.appendChild(reviewResultLink)
  root.appendChild(review)

  let messageCallback: ((value: string) => void) | null = null
  let commitCallback: (() => void) | null = null
  let pushCallback: (() => void) | null = null
  let reviewFormCallback:
    | ((form: { title?: string; body?: string; draft?: boolean }) => void)
    | null = null
  let reviewPrimaryCallback: (() => void) | null = null
  message.addEventListener('input', () => messageCallback?.(message.value))
  message.addEventListener('keydown', (event: KeyboardEvent) => {
    // Why: ⌘/Ctrl+Enter is the editor-standard commit chord; plain Enter stays a newline.
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && !commit.disabled) {
      event.preventDefault()
      commitCallback?.()
    }
  })
  commit.addEventListener('click', () => commitCallback?.())
  push.addEventListener('click', () => pushCallback?.())
  reviewTitle.addEventListener('input', () => reviewFormCallback?.({ title: reviewTitle.value }))
  reviewBody.addEventListener('input', () => reviewFormCallback?.({ body: reviewBody.value }))
  draft.addEventListener('change', () => reviewFormCallback?.({ draft: draft.checked }))
  reviewButton.addEventListener('click', () => reviewPrimaryCallback?.())

  function applyReview(model: SourceControlModel['review']): void {
    review.hidden = model === null
    root.classList.toggle('cubito-source-control--review', model !== null)
    if (model === null) return
    reviewForm.hidden = !model.showForm
    draftRow.hidden = !model.showDraft
    // Why: rewriting a field's value while typing would reset the caret.
    if (reviewTitle.value !== model.title) reviewTitle.value = model.title
    if (reviewBody.value !== model.body) reviewBody.value = model.body
    draft.checked = model.draft
    reviewBlocked.textContent = model.blockedText ?? ''
    reviewBlocked.hidden = model.blockedText === null
    const isLink = model.primary.href !== undefined
    reviewButton.hidden = isLink
    reviewLink.hidden = !isLink
    reviewButton.textContent = model.primary.label
    reviewButton.disabled = model.primary.disabled
    reviewLink.textContent = model.primary.label
    if (model.primary.href !== undefined) reviewLink.href = model.primary.href
    reviewResult.textContent = model.result?.text ?? ''
    reviewResult.className = `cubito-source-control__notice${model.result ? ` cubito-source-control__notice--${model.result.tone}` : ''}`
    reviewResultLink.hidden = model.result?.href === undefined
    if (model.result?.href !== undefined) reviewResultLink.href = model.result.href
  }

  return {
    root,
    apply(model) {
      root.hidden = !model.visible
      status.textContent = model.statusLine
      // Why: rewriting the value while typing would reset the caret.
      if (message.value !== model.message) message.value = model.message
      message.disabled = model.messageDisabled
      commit.textContent = model.commitLabel
      commit.disabled = model.commitDisabled
      push.textContent = model.pushLabel
      push.disabled = model.pushDisabled
      notice.textContent = model.notice?.text ?? ''
      applyReview(model.review)
      notice.className = `cubito-source-control__notice${model.notice ? ` cubito-source-control__notice--${model.notice.tone}` : ''}`
    },
    onMessageChange: (cb) => (messageCallback = cb),
    onCommit: (cb) => (commitCallback = cb),
    onPush: (cb) => (pushCallback = cb),
    onReviewForm: (cb) => (reviewFormCallback = cb),
    onReviewPrimary: (cb) => (reviewPrimaryCallback = cb),
    dispose() {
      root.remove()
    }
  }
}
