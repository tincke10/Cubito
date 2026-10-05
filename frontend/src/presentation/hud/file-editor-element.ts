import { createTwoStepButton } from './two-step-button'
import { indentUnitFor, insertIndent } from './file-editor-indent'
import { isIndentKey, isSaveChord } from './file-editor-keys'
import type { FileEditorPanelModel } from './file-editor-view-model'
import { t } from '../../application/i18n/translate'
import { renderFailureText } from '../failure-text-element'

export type FileEditorHandle = {
  readonly root: HTMLElement
  apply(model: FileEditorPanelModel): void
  onEdit(cb: (content: string) => void): void
  onSave(cb: () => void): void
  onClose(cb: () => void): void
  onReload(cb: () => void): void
  onOverwrite(cb: () => void): void
  onDiscard(cb: () => void): void
  onKeepEditing(cb: () => void): void
  focusText(): void
  dispose(): void
}

const toggle = (element: HTMLElement, visible: boolean): void => {
  element.hidden = !visible
}

/** Full-screen file pane over any scene mode (diff replaces the HUD, so it mounts on the body). */
export function createFileEditor(
  doc: Document = document,
  platform: { isMac: boolean } = { isMac: navigator.userAgent.includes('Mac') }
): FileEditorHandle {
  const el = (tag: string, className: string): HTMLElement => {
    const element = doc.createElement(tag)
    element.className = className
    return element
  }
  const button = (className: string, label: string): HTMLButtonElement => {
    const element = doc.createElement('button')
    element.type = 'button'
    element.className = className
    element.textContent = label
    return element
  }
  const root = el('div', 'cubito-file-editor')
  const card = el('div', 'cubito-file-editor__card')
  const header = el('div', 'cubito-file-editor__header')
  const title = el('span', 'cubito-file-editor__title')
  const dirtyMark = el('span', 'cubito-file-editor__dirty')
  dirtyMark.textContent = '●'
  dirtyMark.title = t('editor.unsavedMark')
  const badge = el('span', 'cubito-file-editor__badge')
  const save = button('cubito-file-editor__save', t('editor.save'))
  const close = button('cubito-file-editor__close', t('editor.close'))
  for (const child of [title, dirtyMark, badge, save, close]) header.appendChild(child)
  const text = doc.createElement('textarea')
  text.className = 'cubito-file-editor__text'
  text.spellcheck = false
  const message = el('div', 'cubito-file-editor__message')
  const notice = el('div', 'cubito-file-editor__notice')

  const conflictBar = el('div', 'cubito-file-editor__bar')
  const conflictText = el('span', 'cubito-file-editor__bar-text')
  const reload = createTwoStepButton(doc, 'cubito-file-editor__bar-action')
  const overwrite = createTwoStepButton(doc, 'cubito-file-editor__bar-action')
  for (const child of [conflictText, reload.element, overwrite.element]) {
    conflictBar.appendChild(child)
  }
  const discardBar = el('div', 'cubito-file-editor__bar')
  const discardText = el('span', 'cubito-file-editor__bar-text')
  const discard = createTwoStepButton(doc, 'cubito-file-editor__bar-action')
  const keepEditing = button('cubito-file-editor__close', t('editor.keepEditing'))
  for (const child of [discardText, discard.element, keepEditing]) discardBar.appendChild(child)

  for (const child of [header, text, message, notice, conflictBar, discardBar]) {
    card.appendChild(child)
  }
  root.appendChild(card)

  let editCallback: ((content: string) => void) | null = null
  let saveCallback: (() => void) | null = null
  let closeCallback: (() => void) | null = null
  let keepEditingCallback: (() => void) | null = null
  save.addEventListener('click', () => saveCallback?.())
  close.addEventListener('click', () => closeCallback?.())
  keepEditing.addEventListener('click', () => keepEditingCallback?.())
  text.addEventListener('input', () => editCallback?.(text.value))
  root.addEventListener('keydown', (event) => {
    if (isSaveChord(event, platform)) {
      event.preventDefault() // the browser's "save page" would otherwise open
      saveCallback?.()
      return
    }
    const onButton = (event.target as HTMLElement).tagName === 'BUTTON'
    // Why: a focused button owns Esc (the two-step buttons disarm); the window handler closes then.
    if (event.key === 'Escape' && !onButton) {
      event.preventDefault()
      closeCallback?.()
      return
    }
    if (event.target === text && !text.readOnly && isIndentKey(event)) {
      event.preventDefault()
      const next = insertIndent(
        text.value,
        text.selectionStart,
        text.selectionEnd,
        indentUnitFor(text.value)
      )
      text.value = next.value
      text.setSelectionRange(next.caret, next.caret)
      editCallback?.(text.value)
    }
  })

  return {
    root,
    apply(model) {
      root.hidden = !model.visible
      title.textContent = model.title
      badge.textContent = model.badge ?? ''
      toggle(badge, model.badge !== null)
      toggle(dirtyMark, model.dirty)
      toggle(save, !model.readOnly)
      save.disabled = !model.saveEnabled
      if (text.value !== model.text) text.value = model.text
      text.readOnly = model.readOnly
      renderFailureText(doc, message, model.message ?? '')
      toggle(message, model.message !== null)
      notice.textContent = model.notice ?? ''
      toggle(notice, model.notice !== null)
      toggle(conflictBar, model.conflict !== null)
      if (model.conflict) {
        conflictText.textContent = model.conflict.message
        reload.apply({ labels: model.conflict.reload, busy: model.conflict.busy, disabled: false })
        overwrite.apply({
          labels: model.conflict.overwrite,
          busy: model.conflict.busy,
          disabled: false
        })
      }
      toggle(discardBar, model.discard !== null)
      if (model.discard) {
        discardText.textContent = model.discard.message
        discard.apply({ labels: model.discard.labels, busy: false, disabled: false })
      }
    },
    onEdit: (cb) => (editCallback = cb),
    onSave: (cb) => (saveCallback = cb),
    onClose: (cb) => (closeCallback = cb),
    onReload: (cb) => reload.onConfirm(cb),
    onOverwrite: (cb) => overwrite.onConfirm(cb),
    onDiscard: (cb) => discard.onConfirm(cb),
    onKeepEditing: (cb) => (keepEditingCallback = cb),
    focusText: () => text.focus(),
    dispose: () => root.remove()
  }
}
