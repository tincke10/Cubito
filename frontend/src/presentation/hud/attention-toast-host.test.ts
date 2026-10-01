import { describe, expect, it, vi } from 'vitest'
import { createAttentionToastHost } from './attention-toast-host'
import type { AttentionNotification } from '../../application/ports/attention-notification-port'

class FakeElement {
  className = ''
  textContent = ''
  children: FakeElement[] = []
  attributes: Record<string, string> = {}
  listeners: Record<string, () => void> = {}
  parent: FakeElement | null = null
  setAttribute(name: string, value: string) {
    this.attributes[name] = value
  }
  appendChild(child: FakeElement) {
    child.parent = this
    this.children.push(child)
    return child
  }
  addEventListener(type: string, listener: () => void) {
    this.listeners[type] = listener
  }
  remove() {
    this.parent?.children.splice(this.parent.children.indexOf(this), 1)
    this.parent = null
  }
}

const doc = { createElement: () => new FakeElement() } as unknown as Document

const note = (id: string, extra: Partial<AttentionNotification> = {}): AttentionNotification => ({
  notificationId: id,
  seq: null,
  title: `title-${id}`,
  body: `body-${id}`,
  worktreeId: 'r::/p',
  agentState: 'blocked',
  ...extra
})

function setup(overrides: { max?: number } = {}) {
  const parent = new FakeElement()
  const timers: { fn: () => void; ms: number; cleared: boolean }[] = []
  const onActivate = vi.fn()
  const host = createAttentionToastHost(doc, parent as unknown as HTMLElement, {
    onActivate,
    schedule: (fn, ms) => {
      const timer = { fn, ms, cleared: false }
      timers.push(timer)
      return timer
    },
    cancel: (handle) => {
      ;(handle as { cleared: boolean }).cleared = true
    },
    ...overrides
  })
  const stack = parent.children[0]!
  return { host, stack, timers, onActivate }
}

describe('attention toast host', () => {
  it('mounts a polite live region and renders title, body and state', () => {
    const { host, stack } = setup()
    host.show(note('a'))
    expect(stack.attributes['aria-live']).toBe('polite')
    expect(stack.children).toHaveLength(1)
    const toast = stack.children[0]!
    expect(toast.attributes['data-state']).toBe('blocked')
    expect(toast.children.map((c) => c.textContent)).toEqual(['title-a', 'body-a'])
  })

  it('auto-dismisses after the ttl', () => {
    const { host, stack, timers } = setup()
    host.show(note('a'))
    expect(timers[0]!.ms).toBe(8000)
    timers[0]!.fn()
    expect(stack.children).toHaveLength(0)
  })

  it('keeps at most `max` toasts, dropping the oldest', () => {
    const { host, stack, timers } = setup({ max: 2 })
    host.show(note('a'))
    host.show(note('b'))
    host.show(note('c'))
    expect(stack.children.map((t) => t.children[0]!.textContent)).toEqual(['title-b', 'title-c'])
    expect(timers[0]!.cleared).toBe(true)
  })

  it('click activates the worktree and dismisses the toast', () => {
    const { host, stack, onActivate } = setup()
    host.show(note('a'))
    stack.children[0]!.listeners.click!()
    expect(onActivate).toHaveBeenCalledWith('r::/p')
    expect(stack.children).toHaveLength(0)
  })

  it('dispose removes the stack and cancels timers', () => {
    const { host, stack, timers } = setup()
    host.show(note('a'))
    host.dispose()
    expect(stack.parent).toBeNull()
    expect(timers[0]!.cleared).toBe(true)
  })
})
