import type { FileEditorPanelModel } from './file-editor-view-model'

export type FileEditorHandle = {
  readonly root: HTMLElement
  apply(model: FileEditorPanelModel): void
  onClose(cb: () => void): void
  focusText(): void
  dispose(): void
}

/** Full-screen file pane over any scene mode (diff replaces the HUD, so it mounts on the body). */
export function createFileEditor(doc: Document = document): FileEditorHandle {
  const root = doc.createElement('div')
  root.className = 'cubito-file-editor'
  const card = doc.createElement('div')
  card.className = 'cubito-file-editor__card'
  const header = doc.createElement('div')
  header.className = 'cubito-file-editor__header'
  const title = doc.createElement('span')
  title.className = 'cubito-file-editor__title'
  const badge = doc.createElement('span')
  badge.className = 'cubito-file-editor__badge'
  const close = doc.createElement('button')
  close.type = 'button'
  close.className = 'cubito-file-editor__close'
  close.textContent = 'cerrar'
  header.appendChild(title)
  header.appendChild(badge)
  header.appendChild(close)
  const text = doc.createElement('textarea')
  text.className = 'cubito-file-editor__text'
  text.spellcheck = false
  const message = doc.createElement('div')
  message.className = 'cubito-file-editor__message'
  card.appendChild(header)
  card.appendChild(text)
  card.appendChild(message)
  root.appendChild(card)

  let closeCallback: (() => void) | null = null
  close.addEventListener('click', () => closeCallback?.())
  root.addEventListener('keydown', (event) => {
    // Why: a focused button owns Esc (the two-step buttons disarm); the window handler closes then.
    if (event.key === 'Escape' && (event.target as HTMLElement).tagName !== 'BUTTON') {
      event.preventDefault()
      closeCallback?.()
    }
  })

  return {
    root,
    apply(model) {
      root.hidden = !model.visible
      title.textContent = model.title
      badge.textContent = model.badge ?? ''
      badge.hidden = model.badge === null
      if (text.value !== model.text) text.value = model.text
      text.readOnly = model.readOnly
      message.textContent = model.message ?? ''
      message.hidden = model.message === null
    },
    onClose: (cb) => (closeCallback = cb),
    focusText: () => text.focus(),
    dispose: () => root.remove()
  }
}
