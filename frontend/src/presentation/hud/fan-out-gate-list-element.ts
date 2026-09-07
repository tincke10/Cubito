import type { FanOutGateViewModel, FanOutQuestionViewModel } from './fan-out-decision-view-model'
import { resolveSpawnFormKey } from './spawn-form-element'

export type FanOutGateListModel = {
  readonly gates: readonly FanOutGateViewModel[]
  readonly questions: readonly FanOutQuestionViewModel[]
}

/** A rejecting callback surfaces its error inline on the row (non-destructive — row stays,
 *  button re-enables); a resolving one leaves the row disabled until the next poll drops it. */
type RowSubmitCallback = (id: string, value: string) => void | Promise<void>

export type FanOutGateListHandle = {
  readonly element: HTMLElement
  apply(model: FanOutGateListModel): void
  onResolveGate(callback: (gateId: string, resolution: string) => void | Promise<void>): () => void
  onAnswerQuestion(callback: (messageId: string, body: string) => void | Promise<void>): () => void
  dispose(): void
}

type GateRow = {
  root: HTMLElement
  select: HTMLSelectElement
  submit: HTMLButtonElement
  error: HTMLElement
}
type QuestionRow = {
  root: HTMLElement
  textarea: HTMLTextAreaElement
  submit: HTMLButtonElement
  error: HTMLElement
}

/** Fills a <select> with a gate's options — rebuilt only on row creation, never on a later
 *  apply(), so an in-flight user pick survives the ~1.5s poll re-render. */
function populateOptions(
  doc: Document,
  select: HTMLSelectElement,
  options: readonly string[]
): void {
  for (const value of options) {
    const option = doc.createElement('option')
    option.textContent = value
    option.value = value
    select.appendChild(option)
  }
}

/**
 * HUD-anchored list of interactive rows for PENDING decision gates (picker+resolve) and PENDING
 * question threads (textarea+answer) — mounted below the fan-out running panel's counters line
 * (design pin 10). Reuses fan-out-element.ts's <select>/<textarea> field patterns and
 * resolveSpawnFormKey's Enter/Escape convention. Reconciles by id on `apply()` instead of a full
 * rebuild: an existing row's control keeps its live value/disabled/error state across poll ticks,
 * so a user mid-pick or mid-typing never loses their draft to the next `decisionVisibility` fetch.
 */
export function createFanOutGateList(doc: Document = document): FanOutGateListHandle {
  const root = doc.createElement('div')
  root.className = 'cubito-decision-list'
  root.style.pointerEvents = 'auto'

  const gateRows = new Map<string, GateRow>()
  const questionRows = new Map<string, QuestionRow>()

  let resolveGateCallback: ((gateId: string, resolution: string) => void | Promise<void>) | null =
    null
  let answerQuestionCallback: ((messageId: string, body: string) => void | Promise<void>) | null =
    null

  const runSubmit = async (
    getCallback: () => RowSubmitCallback | null,
    id: string,
    value: string,
    submit: HTMLButtonElement,
    error: HTMLElement
  ): Promise<void> => {
    const callback = getCallback()
    if (!callback || submit.disabled) return
    submit.disabled = true
    error.textContent = ''
    error.style.display = 'none'
    try {
      await callback(id, value)
    } catch (err) {
      submit.disabled = false
      error.textContent = err instanceof Error ? err.message : 'no se pudo enviar'
      error.style.display = ''
    }
  }

  const bindRowKeys = (rowRoot: HTMLElement, trigger: () => void): void => {
    rowRoot.addEventListener('keydown', (event) => {
      const keyEvent = event as unknown as { key: string; target: { tagName: string } }
      const action = resolveSpawnFormKey({
        key: keyEvent.key,
        tagName: keyEvent.target.tagName
      })
      if (action === 'submit') trigger()
    })
  }

  const createGateRow = (gate: FanOutGateViewModel): GateRow => {
    const rowRoot = doc.createElement('div')
    rowRoot.className = 'cubito-decision-row cubito-decision-row--gate'

    const question = doc.createElement('div')
    question.className = 'cubito-decision-row__question'
    question.textContent = gate.question

    const select = doc.createElement('select')
    select.className = 'cubito-decision-row__select'
    populateOptions(doc, select, gate.options)

    const submit = doc.createElement('button')
    submit.className = 'cubito-decision-row__submit'
    submit.textContent = 'resolver'

    const error = doc.createElement('div')
    error.className = 'cubito-decision-row__error'
    error.style.display = 'none'

    for (const child of [question, select, submit, error]) rowRoot.appendChild(child)

    const trigger = (): void => {
      void runSubmit(() => resolveGateCallback, gate.gateId, select.value, submit, error)
    }
    submit.addEventListener('click', trigger)
    bindRowKeys(rowRoot, trigger)

    return { root: rowRoot, select, submit, error }
  }

  const createQuestionRow = (question: FanOutQuestionViewModel): QuestionRow => {
    const rowRoot = doc.createElement('div')
    rowRoot.className = 'cubito-decision-row cubito-decision-row--question'

    const label = doc.createElement('div')
    label.className = 'cubito-decision-row__question'
    label.textContent = question.question ?? `${question.askerHandle} · ${question.dispatchId}`

    const textarea = doc.createElement('textarea')
    textarea.className = 'cubito-decision-row__textarea'

    const submit = doc.createElement('button')
    submit.className = 'cubito-decision-row__submit'
    submit.textContent = 'responder'

    const error = doc.createElement('div')
    error.className = 'cubito-decision-row__error'
    error.style.display = 'none'

    for (const child of [label, textarea, submit, error]) rowRoot.appendChild(child)

    const trigger = (): void => {
      void runSubmit(
        () => answerQuestionCallback,
        question.messageId,
        textarea.value,
        submit,
        error
      )
    }
    submit.addEventListener('click', trigger)
    bindRowKeys(rowRoot, trigger)

    return { root: rowRoot, textarea, submit, error }
  }

  return {
    element: root,
    apply(model: FanOutGateListModel) {
      const gateIds = new Set(model.gates.map((g) => g.gateId))
      for (const id of [...gateRows.keys()]) {
        if (!gateIds.has(id)) gateRows.delete(id)
      }
      for (const gate of model.gates) {
        if (!gateRows.has(gate.gateId)) gateRows.set(gate.gateId, createGateRow(gate))
      }

      const questionIds = new Set(model.questions.map((q) => q.messageId))
      for (const id of [...questionRows.keys()]) {
        if (!questionIds.has(id)) questionRows.delete(id)
      }
      for (const question of model.questions) {
        if (!questionRows.has(question.messageId)) {
          questionRows.set(question.messageId, createQuestionRow(question))
        }
      }

      // Re-parents in one pass (mirrors project-selector-element.ts's replaceChildren+re-append
      // list pattern) rather than removing individual rows: a dropped id's row simply isn't
      // re-appended, while a kept row is the SAME element reference — its live select/textarea
      // value, disabled state and inline error survive the reconciliation untouched.
      root.replaceChildren()
      for (const gate of model.gates) root.appendChild(gateRows.get(gate.gateId)!.root)
      for (const question of model.questions) {
        root.appendChild(questionRows.get(question.messageId)!.root)
      }
    },
    onResolveGate(callback) {
      resolveGateCallback = callback
      return () => (resolveGateCallback = null)
    },
    onAnswerQuestion(callback) {
      answerQuestionCallback = callback
      return () => (answerQuestionCallback = null)
    },
    dispose() {
      root.remove()
      gateRows.clear()
      questionRows.clear()
    }
  }
}
