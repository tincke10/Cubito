import { describe, expect, it, vi } from 'vitest'
import { isTerminalExitChord, terminalCustomKeyEventHandler } from './terminal-panel-element'

describe('isTerminalExitChord', () => {
  it('is true for Ctrl+]', () => {
    expect(isTerminalExitChord(']', true)).toBe(true)
  })

  it('is false for ] without Ctrl', () => {
    expect(isTerminalExitChord(']', false)).toBe(false)
  })

  it('is false for Escape, even with Ctrl held', () => {
    expect(isTerminalExitChord('Escape', true)).toBe(false)
  })
})

describe('terminalCustomKeyEventHandler', () => {
  it('returns false and fires onExit for a Ctrl+] keydown — xterm must not process it', () => {
    const onExit = vi.fn()
    const result = terminalCustomKeyEventHandler(
      { type: 'keydown', key: ']', ctrlKey: true },
      onExit
    )
    expect(result).toBe(false)
    expect(onExit).toHaveBeenCalledOnce()
  })

  it('returns true and never fires onExit for Escape — it must always reach the PTY', () => {
    const onExit = vi.fn()
    const result = terminalCustomKeyEventHandler(
      { type: 'keydown', key: 'Escape', ctrlKey: false },
      onExit
    )
    expect(result).toBe(true)
    expect(onExit).not.toHaveBeenCalled()
  })

  it('returns true for an ordinary character keydown', () => {
    const onExit = vi.fn()
    expect(
      terminalCustomKeyEventHandler({ type: 'keydown', key: 'a', ctrlKey: false }, onExit)
    ).toBe(true)
    expect(onExit).not.toHaveBeenCalled()
  })

  it('does not fire onExit for a keyup carrying the same chord', () => {
    const onExit = vi.fn()
    const result = terminalCustomKeyEventHandler({ type: 'keyup', key: ']', ctrlKey: true }, onExit)
    expect(result).toBe(true)
    expect(onExit).not.toHaveBeenCalled()
  })
})
