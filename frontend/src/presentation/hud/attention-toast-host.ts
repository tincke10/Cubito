import type { AttentionNotification } from '../../application/ports/attention-notification-port'

const DEFAULT_TTL_MS = 8000
const DEFAULT_MAX_TOASTS = 3

export type AttentionToastHost = {
  show(notification: AttentionNotification): void
  dispose(): void
}

type ToastEntry = { element: HTMLElement; timer: unknown }

/** HUD toast stack for agent attention; the always-on fallback when OS notifications are unavailable. */
export function createAttentionToastHost(
  doc: Document,
  parent: HTMLElement,
  options: {
    onActivate(worktreeId: string): void
    schedule?: (fn: () => void, ms: number) => unknown
    cancel?: (handle: unknown) => void
    ttlMs?: number
    max?: number
  }
): AttentionToastHost {
  const schedule = options.schedule ?? ((fn, ms) => setTimeout(fn, ms))
  const cancel = options.cancel ?? ((handle) => clearTimeout(handle as number))
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS
  const max = options.max ?? DEFAULT_MAX_TOASTS
  const stack = doc.createElement('div')
  stack.className = 'cubito-toast-stack'
  stack.setAttribute('role', 'status')
  stack.setAttribute('aria-live', 'polite')
  parent.appendChild(stack)
  const entries: ToastEntry[] = []

  function dismiss(entry: ToastEntry): void {
    cancel(entry.timer)
    entry.element.remove()
    const index = entries.indexOf(entry)
    if (index >= 0) entries.splice(index, 1)
  }

  return {
    show(notification) {
      const element = doc.createElement('div')
      element.className = 'cubito-toast'
      element.setAttribute('data-state', notification.agentState ?? 'done')
      const title = doc.createElement('div')
      title.className = 'cubito-toast__title'
      title.textContent = notification.title
      const body = doc.createElement('div')
      body.className = 'cubito-toast__body'
      body.textContent = notification.body
      element.appendChild(title)
      element.appendChild(body)
      const entry: ToastEntry = { element, timer: null }
      entry.timer = schedule(() => dismiss(entry), ttlMs)
      element.addEventListener('click', () => {
        if (notification.worktreeId) options.onActivate(notification.worktreeId)
        dismiss(entry)
      })
      stack.appendChild(element)
      entries.push(entry)
      while (entries.length > max) dismiss(entries[0]!)
    },
    dispose() {
      for (const entry of [...entries]) dismiss(entry)
      stack.remove()
    }
  }
}
