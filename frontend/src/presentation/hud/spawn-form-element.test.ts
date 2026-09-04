import { describe, expect, it, vi } from 'vitest'
import { createSpawnForm, resolveSpawnFormKey } from './spawn-form-element'
import type { SpawnFormViewModel } from './spawn-view-model'

describe('resolveSpawnFormKey', () => {
  it('Escape from any field cancels', () => {
    expect(resolveSpawnFormKey({ key: 'Escape', tagName: 'INPUT' })).toBe('cancel')
    expect(resolveSpawnFormKey({ key: 'Escape', tagName: 'TEXTAREA' })).toBe('cancel')
    expect(resolveSpawnFormKey({ key: 'Escape', tagName: 'SELECT' })).toBe('cancel')
  })

  it('Enter from a single-line field submits', () => {
    expect(resolveSpawnFormKey({ key: 'Enter', tagName: 'INPUT' })).toBe('submit')
    expect(resolveSpawnFormKey({ key: 'Enter', tagName: 'SELECT' })).toBe('submit')
  })

  it('Enter from the PROMPT textarea does not submit — multi-line entry needs its own newline', () => {
    expect(resolveSpawnFormKey({ key: 'Enter', tagName: 'TEXTAREA' })).toBeNull()
  })

  it('an ordinary keystroke resolves to nothing', () => {
    expect(resolveSpawnFormKey({ key: 'a', tagName: 'INPUT' })).toBeNull()
  })
})

type FakeElement = {
  tagName: string
  readonly style: Record<string, string>
  readonly children: FakeElement[]
  className: string
  textContent: string
  value: string
  disabled: boolean
  readonly listeners: Record<string, ((event: unknown) => void)[]>
  addEventListener(type: string, cb: (event: unknown) => void): void
  removeEventListener(type: string, cb: (event: unknown) => void): void
  appendChild(child: FakeElement): FakeElement
  setAttribute(): void
  remove(): void
  focus(): void
  fire(type: string, event?: Record<string, unknown>): void
}

const createFakeElement = (tag: string): FakeElement => {
  const listeners: Record<string, ((event: unknown) => void)[]> = {}
  const el: FakeElement = {
    tagName: tag.toUpperCase(),
    style: {},
    children: [],
    className: '',
    textContent: '',
    value: '',
    disabled: false,
    listeners,
    addEventListener(type, cb) {
      ;(listeners[type] ??= []).push(cb)
    },
    removeEventListener(type, cb) {
      listeners[type] = (listeners[type] ?? []).filter((l) => l !== cb)
    },
    appendChild(child) {
      el.children.push(child)
      return child
    },
    setAttribute() {},
    remove() {},
    focus() {},
    fire(type, event = {}) {
      for (const cb of listeners[type] ?? []) cb({ target: el, ...event })
    }
  }
  return el
}

const createFakeDocument = (): Document =>
  ({ createElement: (tag: string) => createFakeElement(tag) }) as unknown as Document

const idleModel = (overrides: Partial<SpawnFormViewModel> = {}): SpawnFormViewModel => ({
  view: 'form',
  title: 'spawn hijo · desde raíz',
  name: { value: '', enabled: true },
  agent: { value: 'none', enabled: true },
  baseBranch: { value: '', enabled: true },
  prompt: { value: '', enabled: false },
  submitLabel: 'crear worktree',
  submitEnabled: false,
  errorMessage: null,
  ...overrides
})

describe('createSpawnForm', () => {
  it('apply() writes field values and enablement from the model', () => {
    const form = createSpawnForm(createFakeDocument())
    form.apply(
      idleModel({
        name: { value: 'auth-retry-tests', enabled: true },
        baseBranch: { value: 'develop', enabled: true },
        agent: { value: 'claude', enabled: true },
        prompt: { value: 'hola', enabled: true }
      })
    )
    const root = form.element as unknown as FakeElement
    const [nameInput, agentSelect, baseInput, promptArea] = [
      root.children.find((c) => c.tagName === 'INPUT' && c.className.includes('name')),
      root.children.find((c) => c.tagName === 'SELECT'),
      root.children.find((c) => c.tagName === 'INPUT' && c.className.includes('base')),
      root.children.find((c) => c.tagName === 'TEXTAREA')
    ]
    expect(nameInput?.value).toBe('auth-retry-tests')
    expect(agentSelect?.value).toBe('claude')
    expect(baseInput?.value).toBe('develop')
    expect(promptArea?.value).toBe('hola')
    expect(promptArea?.disabled).toBe(false)
  })

  it('disables PROMPT when the model says it is disabled', () => {
    const form = createSpawnForm(createFakeDocument())
    form.apply(idleModel())
    const root = form.element as unknown as FakeElement
    const promptArea = root.children.find((c) => c.tagName === 'TEXTAREA')
    expect(promptArea?.disabled).toBe(true)
  })

  it('typing in NOMBRE fires onFieldChange("name", value)', () => {
    const form = createSpawnForm(createFakeDocument())
    form.apply(idleModel())
    const onFieldChange = vi.fn()
    form.onFieldChange(onFieldChange)
    const root = form.element as unknown as FakeElement
    const nameInput = root.children.find(
      (c) => c.tagName === 'INPUT' && c.className.includes('name')
    )!
    nameInput.value = 'new-name'
    nameInput.fire('input')
    expect(onFieldChange).toHaveBeenCalledWith('name', 'new-name')
  })

  it('choosing an agent fires onFieldChange("agent", value)', () => {
    const form = createSpawnForm(createFakeDocument())
    form.apply(idleModel())
    const onFieldChange = vi.fn()
    form.onFieldChange(onFieldChange)
    const root = form.element as unknown as FakeElement
    const agentSelect = root.children.find((c) => c.tagName === 'SELECT')!
    agentSelect.value = 'claude'
    agentSelect.fire('change')
    expect(onFieldChange).toHaveBeenCalledWith('agent', 'claude')
  })

  it('clicking crear worktree fires onSubmit', () => {
    const form = createSpawnForm(createFakeDocument())
    form.apply(idleModel())
    const onSubmit = vi.fn()
    form.onSubmit(onSubmit)
    const root = form.element as unknown as FakeElement
    const submitButton = root.children.find((c) => c.textContent === 'crear worktree')!
    submitButton.fire('click')
    expect(onSubmit).toHaveBeenCalledOnce()
  })

  it('clicking cancelar fires onCancel', () => {
    const form = createSpawnForm(createFakeDocument())
    form.apply(idleModel())
    const onCancel = vi.fn()
    form.onCancel(onCancel)
    const root = form.element as unknown as FakeElement
    const cancelButton = root.children.find((c) => c.textContent === 'cancelar')!
    cancelButton.fire('click')
    expect(onCancel).toHaveBeenCalledOnce()
  })

  it('Escape anywhere in the form fires onCancel', () => {
    const form = createSpawnForm(createFakeDocument())
    form.apply(idleModel())
    const onCancel = vi.fn()
    form.onCancel(onCancel)
    const root = form.element as unknown as FakeElement
    root.fire('keydown', { key: 'Escape', target: { tagName: 'INPUT' } })
    expect(onCancel).toHaveBeenCalledOnce()
  })

  it('Enter in a single-line field fires onSubmit; Enter in PROMPT does not', () => {
    const form = createSpawnForm(createFakeDocument())
    form.apply(idleModel())
    const onSubmit = vi.fn()
    form.onSubmit(onSubmit)
    const root = form.element as unknown as FakeElement
    root.fire('keydown', { key: 'Enter', target: { tagName: 'TEXTAREA' } })
    expect(onSubmit).not.toHaveBeenCalled()
    root.fire('keydown', { key: 'Enter', target: { tagName: 'INPUT' } })
    expect(onSubmit).toHaveBeenCalledOnce()
  })

  it('shows the error message when present', () => {
    const form = createSpawnForm(createFakeDocument())
    form.apply(idleModel({ errorMessage: 'la conexión falló' }))
    const root = form.element as unknown as FakeElement
    const errorEl = root.children.find((c) => c.className.includes('error'))
    expect(errorEl?.textContent).toBe('la conexión falló')
  })

  it('dispose removes the root element', () => {
    const form = createSpawnForm(createFakeDocument())
    const root = form.element as unknown as FakeElement
    let removed = false
    root.remove = () => (removed = true)
    form.dispose()
    expect(removed).toBe(true)
  })
})
