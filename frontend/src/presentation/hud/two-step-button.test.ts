import { describe, expect, it, vi } from 'vitest'
import { createTwoStepButton } from './two-step-button'

type Handler = (event: { key?: string }) => void

const createFakeDocument = (): Document => {
  const handlers: Record<string, Handler> = {}
  const el = {
    type: '',
    className: '',
    textContent: '',
    disabled: false,
    handlers,
    addEventListener: (type: string, handler: Handler) => {
      handlers[type] = handler
    },
    blur: () => undefined
  }
  return { createElement: () => el } as unknown as Document
}

const labels = { idle: 'eliminar', confirm: 'confirmar', busy: 'eliminando…' }

function setup() {
  const doc = createFakeDocument()
  const button = createTwoStepButton(doc, 'x')
  const fire = vi.fn()
  button.onConfirm(fire)
  button.apply({ labels, busy: false, disabled: false })
  const el = button.element as unknown as {
    textContent: string
    disabled: boolean
    handlers: Record<string, Handler>
  }
  return { button, fire, el }
}

describe('two-step button', () => {
  it('arms on the first click and fires only on the second', () => {
    const { fire, el } = setup()
    expect(el.textContent).toBe('eliminar')
    el.handlers.click!({})
    expect(el.textContent).toBe('confirmar')
    expect(fire).not.toHaveBeenCalled()
    el.handlers.click!({})
    expect(fire).toHaveBeenCalledTimes(1)
    expect(el.textContent).toBe('eliminar')
  })

  it('disarms on Escape and on blur', () => {
    const { fire, el } = setup()
    el.handlers.click!({})
    el.handlers.keydown!({ key: 'Escape' })
    expect(el.textContent).toBe('eliminar')
    el.handlers.click!({})
    el.handlers.blur!({})
    el.handlers.click!({})
    expect(fire).not.toHaveBeenCalled()
  })

  it('is inert while disabled and shows the busy label while running', () => {
    const { button, fire, el } = setup()
    button.apply({ labels, busy: true, disabled: false })
    expect(el.disabled).toBe(true)
    expect(el.textContent).toBe('eliminando…')
    el.handlers.click!({})
    expect(fire).not.toHaveBeenCalled()
  })

  it('drops an armed confirm when the owner disables it', () => {
    const { button, fire, el } = setup()
    el.handlers.click!({})
    button.apply({ labels, busy: false, disabled: true })
    button.apply({ labels, busy: false, disabled: false })
    el.handlers.click!({})
    expect(fire).not.toHaveBeenCalled()
  })
})
