import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSystemLiveDriver, SYSTEM_ARC } from './system-live-driver'
import type { SystemLiveDriverDeps } from './system-live-driver'
import { createSceneStore } from './scene-store'
import type { SceneStore } from './scene-store'
import { buildSystemGraph } from '../domain/system-graph/build-system-graph'
import type { SystemGraphPort } from './ports/system-graph-port'

const seedGraph = () =>
  buildSystemGraph({
    nodes: [
      { id: 'router', kind: 'router', label: 'api/routes', state: 'idle', diff: null },
      {
        id: 'POST /auth/retry',
        kind: 'endpoint',
        label: 'POST /auth/retry',
        method: 'POST',
        state: 'idle',
        diff: null
      }
    ],
    edges: [{ from: 'router', to: 'POST /auth/retry', kind: 'normal' }]
  })

describe('createSystemLiveDriver', () => {
  let store: SceneStore
  let dispatchSpy: ReturnType<typeof vi.spyOn>
  let setTimerSpy: ReturnType<typeof vi.fn>
  let clearTimerSpy: ReturnType<typeof vi.fn>

  const makeDeps = (port: SystemGraphPort): SystemLiveDriverDeps => ({
    store,
    port,
    setTimer: setTimerSpy,
    clearTimer: clearTimerSpy
  })

  const fakePort = (graph = seedGraph()): SystemGraphPort => ({
    loadSystemGraph: vi.fn(async () => graph)
  })

  beforeEach(() => {
    vi.useFakeTimers()
    store = createSceneStore()
    dispatchSpy = vi.spyOn(store, 'dispatchSystemView')
    setTimerSpy = vi.fn((fn: () => void, ms: number) => setTimeout(fn, ms))
    clearTimerSpy = vi.fn((handle: unknown) =>
      clearTimeout(handle as ReturnType<typeof setTimeout>)
    )
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('start() dispatches open, seeds the graph via apply-delta from the port, then plays SYSTEM_ARC beats in order at the right delays', async () => {
    const graph = seedGraph()
    const port = fakePort(graph)
    const driver = createSystemLiveDriver(makeDeps(port))

    driver.start('POST /auth/retry')
    expect(dispatchSpy).toHaveBeenCalledWith({ type: 'open', nodeId: 'POST /auth/retry' })

    await vi.advanceTimersByTimeAsync(0)
    expect(port.loadSystemGraph).toHaveBeenCalledWith('POST /auth/retry')
    expect(dispatchSpy).toHaveBeenCalledWith({
      type: 'apply-delta',
      delta: { op: 'add-node', node: graph.nodes.get('router') }
    })
    expect(dispatchSpy).toHaveBeenCalledWith({
      type: 'apply-delta',
      delta: { op: 'add-node', node: graph.nodes.get('POST /auth/retry') }
    })
    expect(dispatchSpy).toHaveBeenCalledWith({
      type: 'apply-delta',
      delta: { op: 'add-edge', edge: graph.edges[0] }
    })

    for (const beat of SYSTEM_ARC) {
      await vi.advanceTimersByTimeAsync(beat.delayMs)
      for (const action of beat.actions) {
        expect(dispatchSpy).toHaveBeenCalledWith(action)
      }
    }
    driver.stop()
  })

  it('stop() halts mid-arc: no further dispatch after stop, and never dispatches close itself', async () => {
    const driver = createSystemLiveDriver(makeDeps(fakePort()))
    driver.start('POST /auth/retry')
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(SYSTEM_ARC[0]!.delayMs)
    const callsBeforeStop = dispatchSpy.mock.calls.length

    driver.stop()
    await vi.advanceTimersByTimeAsync(1_000_000)

    expect(dispatchSpy.mock.calls.length).toBe(callsBeforeStop)
    expect(dispatchSpy).not.toHaveBeenCalledWith({ type: 'close' })
  })

  it('restart after stop() replays the arc from the beginning', async () => {
    const driver = createSystemLiveDriver(makeDeps(fakePort()))
    driver.start('POST /auth/retry')
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(SYSTEM_ARC[0]!.delayMs)
    driver.stop()

    dispatchSpy.mockClear()
    driver.start('POST /auth/retry')
    expect(dispatchSpy).toHaveBeenCalledWith({ type: 'open', nodeId: 'POST /auth/retry' })
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(SYSTEM_ARC[0]!.delayMs)
    for (const action of SYSTEM_ARC[0]!.actions) {
      expect(dispatchSpy).toHaveBeenCalledWith(action)
    }
  })

  it('start() while already running is a no-op: no double open, no double seed', async () => {
    const port = fakePort()
    const driver = createSystemLiveDriver(makeDeps(port))
    driver.start('POST /auth/retry')
    await vi.advanceTimersByTimeAsync(0)
    const callsAfterFirstStart = dispatchSpy.mock.calls.length

    driver.start('POST /auth/retry')
    expect(dispatchSpy.mock.calls.length).toBe(callsAfterFirstStart)
    expect(port.loadSystemGraph).toHaveBeenCalledTimes(1)
    driver.stop()
  })

  it('never uses setInterval — only chained setTimeout, never overlapping', async () => {
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval')
    const driver = createSystemLiveDriver(makeDeps(fakePort()))
    driver.start('POST /auth/retry')
    const totalDelay = SYSTEM_ARC.reduce((sum, beat) => sum + beat.delayMs, 0)
    await vi.advanceTimersByTimeAsync(totalDelay + 1)
    expect(setIntervalSpy).not.toHaveBeenCalled()
    driver.stop()
    setIntervalSpy.mockRestore()
  })

  it('no dispatch after the arc naturally ends — the last beat is not replayed', async () => {
    const driver = createSystemLiveDriver(makeDeps(fakePort()))
    driver.start('POST /auth/retry')
    const totalDelay = SYSTEM_ARC.reduce((sum, beat) => sum + beat.delayMs, 0)
    await vi.advanceTimersByTimeAsync(totalDelay)
    const callsAtArcEnd = dispatchSpy.mock.calls.length
    await vi.advanceTimersByTimeAsync(50_000)
    expect(dispatchSpy.mock.calls.length).toBe(callsAtArcEnd)
    driver.stop()
  })
})
