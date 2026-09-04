import type { SpawnFormFields } from '../../application/spawn-menu-model'
import type { SpawnAgent } from '../../application/ports/runtime-gateway'
import type { SpawnFormViewModel } from './spawn-view-model'

export type SpawnFormField = keyof SpawnFormFields

/** Design's `[⏎] crear · [esc] cancelar` footer (SPAWN-005): Escape always cancels; Enter
 *  submits from a single-line field but not from PROMPT, where it must insert a newline. */
export function resolveSpawnFormKey(event: {
  key: string
  tagName: string
}): 'submit' | 'cancel' | null {
  if (event.key === 'Escape') return 'cancel'
  if (event.key === 'Enter' && event.tagName !== 'TEXTAREA') return 'submit'
  return null
}

export type SpawnFormHandle = {
  readonly element: HTMLElement
  apply(model: SpawnFormViewModel): void
  onFieldChange(callback: (field: SpawnFormField, value: string) => void): () => void
  onSubmit(callback: () => void): () => void
  onCancel(callback: () => void): () => void
  focusFirstField(): void
  dispose(): void
}

const AGENT_OPTIONS: readonly SpawnAgent[] = ['none', 'claude']

/**
 * HUD-anchored spawn form (design Area 3/mockup Spawn.dc.html) — a fixed `<div>` panel, built
 * like keyboard-bar.ts with an injectable `doc` for unit testing. Owns its own keydown listener
 * so Escape/Enter never compete with the graph's keyboard-controller while a field is focused.
 */
export function createSpawnForm(doc: Document = document): SpawnFormHandle {
  const root = doc.createElement('div')
  root.className = 'cubito-spawn-form'
  root.style.pointerEvents = 'auto'

  const title = doc.createElement('div')
  title.className = 'cubito-spawn-form__title'

  const nameInput = doc.createElement('input')
  nameInput.className = 'cubito-spawn-form__field cubito-spawn-form__field--name'

  const agentSelect = doc.createElement('select')
  agentSelect.className = 'cubito-spawn-form__field cubito-spawn-form__field--agent'
  for (const agent of AGENT_OPTIONS) {
    const option = doc.createElement('option')
    option.textContent = agent
    ;(option as unknown as HTMLOptionElement).value = agent
    agentSelect.appendChild(option)
  }

  const baseInput = doc.createElement('input')
  baseInput.className = 'cubito-spawn-form__field cubito-spawn-form__field--base'

  const promptArea = doc.createElement('textarea')
  promptArea.className = 'cubito-spawn-form__field cubito-spawn-form__field--prompt'

  const submitButton = doc.createElement('button')
  submitButton.className = 'cubito-spawn-form__submit'

  const cancelButton = doc.createElement('button')
  cancelButton.className = 'cubito-spawn-form__cancel'
  cancelButton.textContent = 'cancelar'

  const errorLine = doc.createElement('div')
  errorLine.className = 'cubito-spawn-form__error'

  const hint = doc.createElement('div')
  hint.className = 'cubito-spawn-form__hint'
  hint.textContent = '⏎ crear · esc cancelar'

  for (const child of [
    title,
    nameInput,
    agentSelect,
    baseInput,
    promptArea,
    errorLine,
    submitButton,
    cancelButton,
    hint
  ]) {
    root.appendChild(child)
  }

  let fieldChangeCallback: ((field: SpawnFormField, value: string) => void) | null = null
  let submitCallback: (() => void) | null = null
  let cancelCallback: (() => void) | null = null

  const emitField = (field: SpawnFormField) => (event: Event) => {
    fieldChangeCallback?.(field, (event.target as unknown as { value: string }).value)
  }
  nameInput.addEventListener('input', emitField('name'))
  agentSelect.addEventListener('change', emitField('agent'))
  baseInput.addEventListener('input', emitField('baseBranch'))
  promptArea.addEventListener('input', emitField('prompt'))

  submitButton.addEventListener('click', () => submitCallback?.())
  cancelButton.addEventListener('click', () => cancelCallback?.())

  root.addEventListener('keydown', (event) => {
    const target = event.target as unknown as { tagName: string }
    const action = resolveSpawnFormKey({
      key: (event as KeyboardEvent).key,
      tagName: target.tagName
    })
    if (action === 'cancel') cancelCallback?.()
    else if (action === 'submit') submitCallback?.()
  })

  return {
    element: root,
    apply(model: SpawnFormViewModel) {
      title.textContent = model.title
      nameInput.value = model.name.value
      nameInput.disabled = !model.name.enabled
      agentSelect.value = model.agent.value
      agentSelect.disabled = !model.agent.enabled
      baseInput.value = model.baseBranch.value
      baseInput.disabled = !model.baseBranch.enabled
      promptArea.value = model.prompt.value
      promptArea.disabled = !model.prompt.enabled
      submitButton.textContent = model.submitLabel
      submitButton.disabled = !model.submitEnabled
      errorLine.textContent = model.errorMessage ?? ''
      errorLine.style.display = model.errorMessage === null ? 'none' : ''
    },
    onFieldChange(callback) {
      fieldChangeCallback = callback
      return () => (fieldChangeCallback = null)
    },
    onSubmit(callback) {
      submitCallback = callback
      return () => (submitCallback = null)
    },
    onCancel(callback) {
      cancelCallback = callback
      return () => (cancelCallback = null)
    },
    focusFirstField() {
      nameInput.focus()
    },
    dispose() {
      root.remove()
    }
  }
}
