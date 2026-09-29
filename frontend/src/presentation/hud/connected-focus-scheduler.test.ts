import { describe, expect, it, vi } from 'vitest'
import { createConnectedFocus } from './connected-focus-scheduler'

function harness(initiallyConnected: boolean, maxFrames?: number) {
  let connected = initiallyConnected
  let nextHandle = 1
  const frames = new Map<number, () => void>()
  const focus = vi.fn()
  const scheduler = createConnectedFocus({
    isConnected: () => connected,
    focus,
    schedule: (callback) => {
      const handle = nextHandle++
      frames.set(handle, callback)
      return handle
    },
    cancel: (handle) => void frames.delete(handle),
    maxFrames
  })
  const runFrame = () => {
    const pending = [...frames.entries()]
    frames.clear()
    pending.forEach(([, callback]) => callback())
  }
  return { scheduler, focus, frames, runFrame, connect: () => (connected = true) }
}

describe('createConnectedFocus', () => {
  it('focuses immediately when the element is already connected', () => {
    const { scheduler, focus, frames } = harness(true)
    scheduler.request()
    expect(focus).toHaveBeenCalledOnce()
    expect(frames.size).toBe(0)
  })

  it('does not focus while disconnected, then focuses on the frame after it connects', () => {
    const { scheduler, focus, runFrame, connect } = harness(false)
    scheduler.request()
    expect(focus).not.toHaveBeenCalled()
    runFrame()
    expect(focus).not.toHaveBeenCalled()
    connect()
    runFrame()
    expect(focus).toHaveBeenCalledOnce()
  })

  it('stops retrying once the frame cap is reached', () => {
    const { scheduler, focus, frames, runFrame } = harness(false, 3)
    scheduler.request()
    for (let i = 0; i < 10; i++) runFrame()
    expect(focus).not.toHaveBeenCalled()
    expect(frames.size).toBe(0)
  })

  it('cancel drops the pending retry', () => {
    const { scheduler, focus, frames, runFrame, connect } = harness(false)
    scheduler.request()
    scheduler.cancel()
    connect()
    runFrame()
    expect(frames.size).toBe(0)
    expect(focus).not.toHaveBeenCalled()
  })

  it('a newer request replaces the pending retry instead of stacking', () => {
    const { scheduler, focus, frames, runFrame, connect } = harness(false)
    scheduler.request()
    scheduler.request()
    expect(frames.size).toBe(1)
    connect()
    runFrame()
    expect(focus).toHaveBeenCalledOnce()
  })
})
