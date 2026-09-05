import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createCamadaMemberPoll, CAMADA_POLL_INTERVAL_MS } from './camada-member-poll'
import type { CamadaPollGatewayPort } from './camada-member-poll'
import { createSceneStore } from './scene-store'
import type { SceneStore } from './scene-store'
import type { FanOutSlice } from './fan-out-model'
import type { WorktreePsRow } from './ports/runtime-gateway'
import type { AgentStatus } from '../domain/worktree-graph/node-activity'
import type { WorktreeId } from '../domain/worktree-graph/types'

type Deferred<T> = { promise: Promise<T>; resolve: (v: T) => void }

function deferred<T>(): Deferred<T> {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

const runningSlice = (memberStatus: Record<WorktreeId, AgentStatus> = {}): FanOutSlice => ({
  view: 'running',
  parentId: 'repo::/parent',
  fields: { count: 2, agent: 'none', prompt: '' },
  repoSelector: 'repo',
  batch: [{ mutationId: 'm1', worktreeId: 'repo::/child', failed: false }],
  memberStatus
})

type FakeGateway = CamadaPollGatewayPort & {
  calls: number
  listWorktreePsImpl?: () => Promise<readonly WorktreePsRow[]>
}

/** Fake gateway: `listWorktreePs` resolution timing and rows are test-controlled. */
function createFakeGateway(rows: readonly WorktreePsRow[] = []): FakeGateway {
  const gw: FakeGateway = {
    calls: 0,
    listWorktreePs: async () => {
      gw.calls += 1
      if (gw.listWorktreePsImpl) return gw.listWorktreePsImpl()
      return rows
    }
  }
  return gw
}

describe('createCamadaMemberPoll', () => {
  let store: SceneStore
  let setTimerSpy: ReturnType<typeof vi.fn>
  let clearTimerSpy: ReturnType<typeof vi.fn>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let setIntervalSpy: any

  beforeEach(() => {
    vi.useFakeTimers()
    store = createSceneStore()
    setTimerSpy = vi.fn((fn: () => void, ms: number) => setTimeout(fn, ms))
    clearTimerSpy = vi.fn((handle: unknown) =>
      clearTimeout(handle as ReturnType<typeof setTimeout>)
    )
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setIntervalSpy = vi.spyOn(globalThis as any, 'setInterval')
  })

  afterEach(() => {
    vi.useRealTimers()
    setIntervalSpy.mockRestore()
  })

  it('does not poll while fanOut.view is not running: no gateway call, no timer scheduled', async () => {
    const gateway = createFakeGateway()
    const poll = createCamadaMemberPoll({
      gateway,
      store,
      setTimer: setTimerSpy,
      clearTimer: clearTimerSpy
    })
    poll.start()
    await vi.advanceTimersByTimeAsync(CAMADA_POLL_INTERVAL_MS * 3)
    expect(gateway.calls).toBe(0)
    expect(setTimerSpy).not.toHaveBeenCalled()
    poll.stop()
  })

  it('polls every CAMADA_POLL_INTERVAL_MS while running, dispatching member-status only for fan-out members', async () => {
    const gateway = createFakeGateway([
      { worktreeId: 'repo::/child', status: 'working' },
      { worktreeId: 'repo::/not-a-member', status: 'working' }
    ])
    store.update({ fanOut: runningSlice() })
    const poll = createCamadaMemberPoll({
      gateway,
      store,
      setTimer: setTimerSpy,
      clearTimer: clearTimerSpy
    })
    poll.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(gateway.calls).toBe(1)
    const slice = store.get().fanOut
    expect(slice.view).toBe('running')
    if (slice.view === 'running') {
      expect(slice.memberStatus).toEqual({ 'repo::/child': 'working' })
    }

    await vi.advanceTimersByTimeAsync(CAMADA_POLL_INTERVAL_MS)
    expect(gateway.calls).toBe(2)
    poll.stop()
  })

  it('maps ps status through mapPsStatusToAgentStatus (permission -> waiting-input, else idle)', async () => {
    const gateway = createFakeGateway([{ worktreeId: 'repo::/parent', status: 'permission' }])
    store.update({ fanOut: runningSlice() })
    const poll = createCamadaMemberPoll({
      gateway,
      store,
      setTimer: setTimerSpy,
      clearTimer: clearTimerSpy
    })
    poll.start()
    await vi.advanceTimersByTimeAsync(0)
    const slice = store.get().fanOut
    if (slice.view === 'running') {
      expect(slice.memberStatus).toEqual({ 'repo::/parent': 'waiting-input' })
    }
    poll.stop()
  })

  it('self-halts scheduling once the slice leaves running mid-flight: no dispatch, no next timer', async () => {
    const gate = deferred<readonly WorktreePsRow[]>()
    const gateway = createFakeGateway()
    gateway.listWorktreePsImpl = () => gate.promise
    store.update({ fanOut: runningSlice() })
    const poll = createCamadaMemberPoll({
      gateway,
      store,
      setTimer: setTimerSpy,
      clearTimer: clearTimerSpy
    })
    poll.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(gateway.calls).toBe(1)
    const callsBeforeLeave = setTimerSpy.mock.calls.length

    store.update({ fanOut: { view: 'closed', repoSelector: null } })
    gate.resolve([{ worktreeId: 'repo::/child', status: 'working' }])
    await vi.advanceTimersByTimeAsync(0)

    expect(store.get().fanOut).toEqual({ view: 'closed', repoSelector: null })
    expect(setTimerSpy.mock.calls.length).toBe(callsBeforeLeave) // no next tick scheduled

    await vi.advanceTimersByTimeAsync(CAMADA_POLL_INTERVAL_MS * 5)
    expect(gateway.calls).toBe(1) // never polled again
    poll.stop()
  })

  it('rebindGateway swaps the gateway used by the next tick, not the in-flight one', async () => {
    const gatewayA = createFakeGateway([])
    const gatewayB = createFakeGateway([])
    store.update({ fanOut: runningSlice() })
    const poll = createCamadaMemberPoll({
      gateway: gatewayA,
      store,
      setTimer: setTimerSpy,
      clearTimer: clearTimerSpy
    })
    poll.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(gatewayA.calls).toBe(1)
    expect(gatewayB.calls).toBe(0)

    poll.rebindGateway(gatewayB)
    await vi.advanceTimersByTimeAsync(CAMADA_POLL_INTERVAL_MS)
    expect(gatewayA.calls).toBe(1)
    expect(gatewayB.calls).toBe(1)
    poll.stop()
  })

  it('stop() clears the pending timer and prevents any further gateway call or dispatch', async () => {
    const gateway = createFakeGateway([])
    store.update({ fanOut: runningSlice() })
    const poll = createCamadaMemberPoll({
      gateway,
      store,
      setTimer: setTimerSpy,
      clearTimer: clearTimerSpy
    })
    poll.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(gateway.calls).toBe(1)

    poll.stop()
    expect(clearTimerSpy).toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(CAMADA_POLL_INTERVAL_MS * 5)
    expect(gateway.calls).toBe(1)
  })

  it('chains the next tick only after the current poll resolves — no overlap when a poll outruns the interval', async () => {
    const gate = deferred<readonly WorktreePsRow[]>()
    const gateway = createFakeGateway()
    gateway.listWorktreePsImpl = () => gate.promise
    store.update({ fanOut: runningSlice() })
    const poll = createCamadaMemberPoll({
      gateway,
      store,
      setTimer: setTimerSpy,
      clearTimer: clearTimerSpy
    })
    poll.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(gateway.calls).toBe(1)

    await vi.advanceTimersByTimeAsync(CAMADA_POLL_INTERVAL_MS * 3)
    expect(gateway.calls).toBe(1) // still in flight — no second poll started
    const callsBeforeSettle = setTimerSpy.mock.calls.length

    gate.resolve([])
    await vi.advanceTimersByTimeAsync(0)
    expect(setTimerSpy.mock.calls.length).toBeGreaterThan(callsBeforeSettle) // scheduled only now

    await vi.advanceTimersByTimeAsync(CAMADA_POLL_INTERVAL_MS)
    expect(gateway.calls).toBe(2)
    poll.stop()
  })

  it('never uses setInterval — only chained setTimeout', async () => {
    const gateway = createFakeGateway([])
    store.update({ fanOut: runningSlice() })
    const poll = createCamadaMemberPoll({ gateway, store })
    poll.start()
    await vi.advanceTimersByTimeAsync(CAMADA_POLL_INTERVAL_MS * 5)
    expect(setIntervalSpy).not.toHaveBeenCalled()
    poll.stop()
  })
})
