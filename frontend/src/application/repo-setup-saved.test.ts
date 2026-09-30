import { describe, expect, it, vi } from 'vitest'
import { createRepoSetupSavedSignal } from './repo-setup-saved'

describe('createRepoSetupSavedSignal', () => {
  it('notifies subscribers until they unsubscribe', () => {
    const signal = createRepoSetupSavedSignal()
    const listener = vi.fn()
    const off = signal.subscribe(listener)
    signal.emit()
    off()
    signal.emit()
    expect(listener).toHaveBeenCalledTimes(1)
  })
})
