import type { SpawnAgent } from '../../application/ports/runtime-gateway'
import type { FanOutFormViewModel, FanOutRunningViewModel } from './fan-out-view-model'

const AGENT_OPTIONS: readonly SpawnAgent[] = ['none', 'claude']

export type FanOutFormHandle = {
  readonly element: HTMLElement
  apply(model: FanOutFormViewModel | FanOutRunningViewModel): void
  onCountChange(callback: (count: number) => void): () => void
  onAgentChange(callback: (agent: SpawnAgent) => void): () => void
  onPromptChange(callback: (prompt: string) => void): () => void
  onSubmit(callback: () => void): () => void
  onCancel(callback: () => void): () => void
  focusFirstField(): void
  dispose(): void
}

/**
 * HUD-anchored fan-out form/running panel (mirrors spawn-form-element.ts): one `<div>` panel
 * built with an injectable `doc`, that renders the form fields while `view === 'form'` and the
 * running callout+counters while `view === 'running'` — a single element for both, since the
 * fan-out slice never has a separate radial step the way spawn does.
 */
export function createFanOutForm(doc: Document = document): FanOutFormHandle {
  const root = doc.createElement('div')
  root.className = 'cubito-fanout-form'
  root.style.pointerEvents = 'auto'

  const countInput = doc.createElement('input')
  countInput.className = 'cubito-fanout-form__field cubito-fanout-form__field--count'
  ;(countInput as unknown as { type: string }).type = 'number'

  const agentSelect = doc.createElement('select')
  agentSelect.className = 'cubito-fanout-form__field cubito-fanout-form__field--agent'
  for (const agent of AGENT_OPTIONS) {
    const option = doc.createElement('option')
    option.textContent = agent
    ;(option as unknown as HTMLOptionElement).value = agent
    agentSelect.appendChild(option)
  }

  const promptArea = doc.createElement('textarea')
  promptArea.className = 'cubito-fanout-form__field cubito-fanout-form__field--prompt'

  const submitButton = doc.createElement('button')
  submitButton.className = 'cubito-fanout-form__submit'
  submitButton.textContent = 'lanzar camada'

  const cancelButton = doc.createElement('button')
  cancelButton.className = 'cubito-fanout-form__cancel'
  cancelButton.textContent = 'cancelar'

  const errorLine = doc.createElement('div')
  errorLine.className = 'cubito-fanout-form__error'

  const callout = doc.createElement('div')
  callout.className = 'cubito-fanout-form__callout'

  const counters = doc.createElement('div')
  counters.className = 'cubito-fanout-form__counters'

  for (const child of [
    countInput,
    agentSelect,
    promptArea,
    errorLine,
    submitButton,
    cancelButton,
    callout,
    counters
  ]) {
    root.appendChild(child)
  }

  let countChangeCallback: ((count: number) => void) | null = null
  let agentChangeCallback: ((agent: SpawnAgent) => void) | null = null
  let promptChangeCallback: ((prompt: string) => void) | null = null
  let submitCallback: (() => void) | null = null
  let cancelCallback: (() => void) | null = null

  countInput.addEventListener('input', (event) => {
    const value = Number((event.target as unknown as { value: string }).value)
    countChangeCallback?.(value)
  })
  agentSelect.addEventListener('change', (event) => {
    agentChangeCallback?.((event.target as unknown as { value: SpawnAgent }).value)
  })
  promptArea.addEventListener('input', (event) => {
    promptChangeCallback?.((event.target as unknown as { value: string }).value)
  })
  submitButton.addEventListener('click', () => submitCallback?.())
  cancelButton.addEventListener('click', () => cancelCallback?.())

  const showFields = (visible: boolean): void => {
    const display = visible ? '' : 'none'
    countInput.style.display = display
    agentSelect.style.display = display
    promptArea.style.display = display
    errorLine.style.display = visible && errorLine.textContent !== '' ? '' : 'none'
    submitButton.style.display = display
    cancelButton.style.display = display
  }

  const showRunning = (visible: boolean): void => {
    const display = visible ? '' : 'none'
    callout.style.display = display
    counters.style.display = display
  }

  return {
    element: root,
    apply(model: FanOutFormViewModel | FanOutRunningViewModel) {
      if (model.view === 'form') {
        showFields(true)
        showRunning(false)
        countInput.value = String(model.count.value)
        ;(countInput as unknown as { min: string }).min = String(model.count.min)
        ;(countInput as unknown as { max: string }).max = String(model.count.max)
        countInput.disabled = !model.count.enabled
        agentSelect.value = model.agent.value
        agentSelect.disabled = !model.agent.enabled
        promptArea.value = model.prompt.value
        promptArea.disabled = !model.prompt.enabled
        submitButton.disabled = !model.submitEnabled
        errorLine.textContent = model.errorMessage ?? ''
        errorLine.style.display = model.errorMessage === null ? 'none' : ''
        return
      }
      showFields(false)
      showRunning(true)
      callout.textContent = model.callout
      counters.textContent = model.counters
    },
    onCountChange(callback) {
      countChangeCallback = callback
      return () => (countChangeCallback = null)
    },
    onAgentChange(callback) {
      agentChangeCallback = callback
      return () => (agentChangeCallback = null)
    },
    onPromptChange(callback) {
      promptChangeCallback = callback
      return () => (promptChangeCallback = null)
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
      countInput.focus()
    },
    dispose() {
      root.remove()
    }
  }
}
