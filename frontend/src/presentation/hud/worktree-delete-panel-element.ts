import { createTwoStepButton } from './two-step-button'
import type { WorktreeDeletePanelModel } from './worktree-delete-view-model'

export type WorktreeDeletePanelHandle = {
  readonly root: HTMLElement
  apply(model: WorktreeDeletePanelModel): void
  onConfirm(cb: () => void): void
  onCancel(cb: () => void): void
  dispose(): void
}

const CANCEL_LABEL = 'cancelar'

/** Centered in-app confirm (no browser dialogs): backdrop + card with the removal summary. */
export function createWorktreeDeletePanel(doc: Document = document): WorktreeDeletePanelHandle {
  const root = doc.createElement('div')
  root.className = 'cubito-worktree-delete'
  const backdrop = doc.createElement('div')
  backdrop.className = 'cubito-worktree-delete__backdrop'
  const card = doc.createElement('div')
  card.className = 'cubito-worktree-delete__card'
  const title = doc.createElement('div')
  title.className = 'cubito-worktree-delete__title'
  const lines = doc.createElement('ul')
  lines.className = 'cubito-worktree-delete__lines'
  const error = doc.createElement('div')
  error.className = 'cubito-worktree-delete__error'
  const actions = doc.createElement('div')
  actions.className = 'cubito-worktree-delete__actions'
  const action = createTwoStepButton(doc, 'cubito-worktree-delete__action')
  const cancel = doc.createElement('button')
  cancel.type = 'button'
  cancel.className = 'cubito-worktree-delete__cancel'
  cancel.textContent = CANCEL_LABEL
  actions.appendChild(action.element)
  actions.appendChild(cancel)
  card.appendChild(title)
  card.appendChild(lines)
  card.appendChild(error)
  card.appendChild(actions)
  root.appendChild(backdrop)
  root.appendChild(card)

  let cancelCallback: (() => void) | null = null
  cancel.addEventListener('click', () => cancelCallback?.())
  backdrop.addEventListener('click', () => cancelCallback?.())

  return {
    root,
    apply(model) {
      root.hidden = !model.visible
      title.textContent = model.title
      lines.replaceChildren()
      for (const text of model.lines) {
        const item = doc.createElement('li')
        item.textContent = text
        lines.appendChild(item)
      }
      error.textContent = model.error ?? ''
      error.hidden = model.error === null
      action.element.hidden = !model.showAction
      action.apply({ labels: model.actionLabels, busy: model.busy, disabled: false })
      cancel.disabled = model.cancelDisabled
    },
    onConfirm: (cb) => action.onConfirm(cb),
    onCancel(cb) {
      cancelCallback = cb
    },
    dispose() {
      root.remove()
    }
  }
}
