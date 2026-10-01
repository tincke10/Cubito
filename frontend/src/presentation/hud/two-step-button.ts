export type TwoStepButtonLabels = { idle: string; confirm: string; busy: string }

export type TwoStepButtonHandle = {
  readonly element: HTMLButtonElement
  /** Re-renders from the owner's state; a disabled or busy button also drops any armed confirm. */
  apply(state: { labels: TwoStepButtonLabels; busy: boolean; disabled: boolean }): void
  /** Fires on the 2nd click of the arm — never on the 1st. */
  onConfirm(cb: () => void): void
  disarm(): void
}

/**
 * Destructive/irreversible actions arm on the first click and fire on the second; Esc/blur
 * disarms. State is ephemeral and local — shared by the compare merge, worktree delete and
 * hosted-review actions instead of three copies of the arm logic.
 */
export function createTwoStepButton(doc: Document, className: string): TwoStepButtonHandle {
  const element = doc.createElement('button')
  element.type = 'button'
  element.className = className

  let armed = false
  let busy = false
  let labels: TwoStepButtonLabels = { idle: '', confirm: '', busy: '' }
  let confirmCallback: (() => void) | null = null

  const render = (): void => {
    element.textContent = busy ? labels.busy : armed ? labels.confirm : labels.idle
  }
  const disarm = (): void => {
    armed = false
    render()
  }

  element.addEventListener('click', () => {
    if (element.disabled) return
    if (!armed) {
      armed = true
      render()
      return
    }
    disarm()
    confirmCallback?.()
    element.blur?.() // release focus — a focused button re-fires on Enter
  })
  element.addEventListener('blur', disarm)
  element.addEventListener('keydown', (event: KeyboardEvent) => {
    if (event.key === 'Escape') disarm()
  })

  return {
    element,
    apply(state) {
      labels = state.labels
      busy = state.busy
      element.disabled = state.disabled || state.busy
      if (element.disabled) armed = false
      render()
    },
    onConfirm(cb) {
      confirmCallback = cb
    },
    disarm
  }
}
