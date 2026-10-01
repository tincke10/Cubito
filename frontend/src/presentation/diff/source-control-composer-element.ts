import type { SourceControlModel } from './source-control-view-model'

export type SourceControlComposerHandle = {
  readonly root: HTMLElement
  apply(model: SourceControlModel): void
  onMessageChange(cb: (message: string) => void): void
  onCommit(cb: () => void): void
  onPush(cb: () => void): void
  dispose(): void
}

const PLACEHOLDER = 'mensaje de commit'

/** Commit composer under the diff rail: staged summary, message box, commit + push, last result. */
export function createSourceControlComposer(doc: Document = document): SourceControlComposerHandle {
  const root = doc.createElement('div')
  root.className = 'cubito-source-control'
  const status = doc.createElement('div')
  status.className = 'cubito-source-control__status'
  const message = doc.createElement('textarea')
  message.className = 'cubito-source-control__message'
  message.placeholder = PLACEHOLDER
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

  let messageCallback: ((value: string) => void) | null = null
  let commitCallback: (() => void) | null = null
  let pushCallback: (() => void) | null = null
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
      notice.className = `cubito-source-control__notice${model.notice ? ` cubito-source-control__notice--${model.notice.tone}` : ''}`
    },
    onMessageChange: (cb) => (messageCallback = cb),
    onCommit: (cb) => (commitCallback = cb),
    onPush: (cb) => (pushCallback = cb),
    dispose() {
      root.remove()
    }
  }
}
