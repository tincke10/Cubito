import { describe, expect, it, vi } from 'vitest'
import { createFanOutGateList } from './fan-out-gate-list-element'
import type { FanOutGateListModel } from './fan-out-gate-list-element'

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
  replaceChildren(): void
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
    replaceChildren() {
      el.children.length = 0
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

const gateModel = (): FanOutGateListModel => ({
  gates: [{ gateId: 'gate-1', taskId: 'task-1', question: 'Which approach?', options: ['a', 'b'] }],
  questions: []
})

const questionModel = (question?: string): FanOutGateListModel => ({
  gates: [],
  questions: [
    {
      messageId: 'msg-1',
      dispatchId: 'dispatch-1',
      askerHandle: 'worker-1',
      ...(question !== undefined ? { question } : {})
    }
  ]
})

const rowsOf = (list: ReturnType<typeof createFanOutGateList>): FakeElement[] =>
  (list.element as unknown as FakeElement).children

const findByClass = (row: FakeElement, cls: string): FakeElement =>
  row.children.find((c) => c.className.includes(cls))!

describe('createFanOutGateList — gate rows', () => {
  it('renders one row per pending gate with a select populated from options and a resolve button', () => {
    const list = createFanOutGateList(createFakeDocument())
    list.apply(gateModel())
    const [row] = rowsOf(list)
    expect(row!.className).toContain('cubito-decision-row--gate')
    const select = findByClass(row!, 'cubito-decision-row__select')
    expect(select.children.map((o) => o.textContent)).toEqual(['a', 'b'])
    const submit = findByClass(row!, 'cubito-decision-row__submit')
    expect(submit.textContent).toBe('resolver')
  })

  it('fires onResolveGate with (gateId, resolution) on submit click', async () => {
    const list = createFanOutGateList(createFakeDocument())
    list.apply(gateModel())
    const onResolveGate = vi.fn(async () => {})
    list.onResolveGate(onResolveGate)
    const [row] = rowsOf(list)
    const select = findByClass(row!, 'cubito-decision-row__select')
    select.value = 'b'
    const submit = findByClass(row!, 'cubito-decision-row__submit')
    submit.fire('click')
    await Promise.resolve()
    expect(onResolveGate).toHaveBeenCalledWith('gate-1', 'b')
  })

  it('disables the button while the submit is in flight, and leaves it disabled on success — the poll drops the row next tick', async () => {
    const list = createFanOutGateList(createFakeDocument())
    list.apply(gateModel())
    let resolveCallback: () => void = () => {}
    const onResolveGate = vi.fn(() => new Promise<void>((resolve) => (resolveCallback = resolve)))
    list.onResolveGate(onResolveGate)
    const [row] = rowsOf(list)
    const submit = findByClass(row!, 'cubito-decision-row__submit')
    submit.fire('click')
    expect(submit.disabled).toBe(true)
    resolveCallback()
    await Promise.resolve()
    await Promise.resolve()
    expect(submit.disabled).toBe(true)
  })

  it('ignores a second click while a submit is already in flight (no double-fire)', () => {
    const list = createFanOutGateList(createFakeDocument())
    list.apply(gateModel())
    const onResolveGate = vi.fn(() => new Promise<void>(() => {}))
    list.onResolveGate(onResolveGate)
    const [row] = rowsOf(list)
    const submit = findByClass(row!, 'cubito-decision-row__submit')
    submit.fire('click')
    submit.fire('click')
    expect(onResolveGate).toHaveBeenCalledTimes(1)
  })

  it('on rejection, re-enables the button and shows the error inline — the row stays', async () => {
    const list = createFanOutGateList(createFakeDocument())
    list.apply(gateModel())
    const onResolveGate = vi.fn(async () => {
      throw new Error('gate_not_pending')
    })
    list.onResolveGate(onResolveGate)
    const [row] = rowsOf(list)
    const submit = findByClass(row!, 'cubito-decision-row__submit')
    submit.fire('click')
    await Promise.resolve()
    await Promise.resolve()
    expect(submit.disabled).toBe(false)
    const error = findByClass(row!, 'cubito-decision-row__error')
    expect(error.textContent).toBe('gate_not_pending')
    expect(rowsOf(list)).toHaveLength(1)
  })

  it('Enter on the select submits; Escape does not', () => {
    const list = createFanOutGateList(createFakeDocument())
    list.apply(gateModel())
    const onResolveGate = vi.fn(async () => {})
    list.onResolveGate(onResolveGate)
    const [row] = rowsOf(list)
    const select = findByClass(row!, 'cubito-decision-row__select')
    row!.fire('keydown', { key: 'Escape', target: select })
    expect(onResolveGate).not.toHaveBeenCalled()
    row!.fire('keydown', { key: 'Enter', target: select })
    expect(onResolveGate).toHaveBeenCalledTimes(1)
  })

  it('re-apply with the same gate id keeps the row (no reset of the picked option)', () => {
    const list = createFanOutGateList(createFakeDocument())
    list.apply(gateModel())
    const [row] = rowsOf(list)
    const select = findByClass(row!, 'cubito-decision-row__select')
    select.value = 'b'
    list.apply(gateModel())
    expect(rowsOf(list)).toHaveLength(1)
    expect(findByClass(rowsOf(list)[0]!, 'cubito-decision-row__select').value).toBe('b')
  })

  it('removes the row once the gate leaves the model (resolved / dropped by the next poll)', () => {
    const list = createFanOutGateList(createFakeDocument())
    list.apply(gateModel())
    expect(rowsOf(list)).toHaveLength(1)
    list.apply({ gates: [], questions: [] })
    expect(rowsOf(list)).toHaveLength(0)
  })
})

describe('createFanOutGateList — question rows', () => {
  it('renders one row per pending question with the question text, a textarea and an answer button', () => {
    const list = createFanOutGateList(createFakeDocument())
    list.apply(questionModel('Which branch should we merge?'))
    const [row] = rowsOf(list)
    expect(row!.className).toContain('cubito-decision-row--question')
    expect(findByClass(row!, 'cubito-decision-row__question').textContent).toBe(
      'Which branch should we merge?'
    )
    expect(findByClass(row!, 'cubito-decision-row__textarea').tagName).toBe('TEXTAREA')
    expect(findByClass(row!, 'cubito-decision-row__submit').textContent).toBe('responder')
  })

  it('falls back to asker/dispatch context when the row has no question text', () => {
    const list = createFanOutGateList(createFakeDocument())
    list.apply(questionModel())
    const [row] = rowsOf(list)
    expect(findByClass(row!, 'cubito-decision-row__question').textContent).toBe(
      'worker-1 · dispatch-1'
    )
  })

  it('fires onAnswerQuestion with (messageId, body) on submit click', async () => {
    const list = createFanOutGateList(createFakeDocument())
    list.apply(questionModel('q?'))
    const onAnswerQuestion = vi.fn(async () => {})
    list.onAnswerQuestion(onAnswerQuestion)
    const [row] = rowsOf(list)
    const textarea = findByClass(row!, 'cubito-decision-row__textarea')
    textarea.value = 'go with a'
    findByClass(row!, 'cubito-decision-row__submit').fire('click')
    await Promise.resolve()
    expect(onAnswerQuestion).toHaveBeenCalledWith('msg-1', 'go with a')
  })

  it('Enter in the textarea inserts a newline instead of submitting', () => {
    const list = createFanOutGateList(createFakeDocument())
    list.apply(questionModel('q?'))
    const onAnswerQuestion = vi.fn(async () => {})
    list.onAnswerQuestion(onAnswerQuestion)
    const [row] = rowsOf(list)
    const textarea = findByClass(row!, 'cubito-decision-row__textarea')
    row!.fire('keydown', { key: 'Enter', target: textarea })
    expect(onAnswerQuestion).not.toHaveBeenCalled()
  })

  it('removes the row once the question leaves the model', () => {
    const list = createFanOutGateList(createFakeDocument())
    list.apply(questionModel('q?'))
    expect(rowsOf(list)).toHaveLength(1)
    list.apply({ gates: [], questions: [] })
    expect(rowsOf(list)).toHaveLength(0)
  })
})

describe('createFanOutGateList — unsubscribe', () => {
  it('onResolveGate/onAnswerQuestion unsubscribe stops future callback delivery', async () => {
    const list = createFanOutGateList(createFakeDocument())
    list.apply(gateModel())
    const onResolveGate = vi.fn(async () => {})
    const unsubscribe = list.onResolveGate(onResolveGate)
    unsubscribe()
    const [row] = rowsOf(list)
    findByClass(row!, 'cubito-decision-row__submit').fire('click')
    await Promise.resolve()
    expect(onResolveGate).not.toHaveBeenCalled()
  })
})
