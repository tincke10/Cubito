import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AGENT_ACTIVITY_POLL_INTERVAL_MS,
  AGENT_ACTIVITY_POLL_LIMIT,
  createAgentActivityPoll
} from './agent-activity-poll'
import type { AgentActivityPollGatewayPort } from './agent-activity-poll'
import { createSceneStore } from './scene-store'
import type { SceneStore } from './scene-store'
import { RpcCallError } from '../infrastructure/rpc/rpc-connection'
import type { AgentActivityEvent, AgentActivityPage } from './ports/runtime-gateway'

type Deferred<T> = { promise: Promise<T>; resolve: (v: T) => void; reject: (e: unknown) => void }

function deferred<T>(): Deferred<T> {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const eventAt = (seq: number): AgentActivityEvent => ({
  seq,
  at: 1_700_000_000_000 + seq,
  kind: 'read',
  tool: 'Read',
  target: `file-${seq}.ts`
})

type FakeGateway = AgentActivityPollGatewayPort & {
  calls: Array<{ worktree: string; sinceSeq?: number; limit?: number }>
  impl?: (worktree: string, sinceSeq?: number, limit?: number) => Promise<AgentActivityPage>
}

function createFakeGateway(page: AgentActivityPage = { events: [], latestSeq: 0 }): FakeGateway {
  const gw: FakeGateway = {
    calls: [],
    agentActivity: async (input) => {
      gw.calls.push(input)
      if (gw.impl) return gw.impl(input.worktree, input.sinceSeq, input.limit)
      return page
    }
  }
  return gw
}

describe('createAgentActivityPoll', () => {
  let store: SceneStore
  let setTimerSpy: ReturnType<typeof vi.fn>
  let clearTimerSpy: ReturnType<typeof vi.fn>
  let onUnsupported: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.useFakeTimers()
    store = createSceneStore()
    setTimerSpy = vi.fn((fn: () => void, ms: number) => setTimeout(fn, ms))
    clearTimerSpy = vi.fn((handle: unknown) =>
      clearTimeout(handle as ReturnType<typeof setTimeout>)
    )
    onUnsupported = vi.fn()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('first tick calls with sinceSeq 0, dispatches mapped rows, advances the cursor', async () => {
    store.dispatchSystemView({ type: 'open', nodeId: '/wt/alpha' })
    const gateway = createFakeGateway({ events: [eventAt(1), eventAt(2)], latestSeq: 2 })
    const poll = createAgentActivityPoll({
      store,
      gateway,
      onUnsupported,
      setTimer: setTimerSpy,
      clearTimer: clearTimerSpy
    })

    poll.start('/wt/alpha')
    await vi.advanceTimersByTimeAsync(0)

    expect(gateway.calls[0]).toEqual({
      worktree: '/wt/alpha',
      sinceSeq: 0,
      limit: AGENT_ACTIVITY_POLL_LIMIT
    })
    const slice = store.get().systemView
    expect(slice.view).toBe('open')
    if (slice.view === 'open') {
      expect(slice.feed.map((r) => r.id)).toEqual(['activity-1', 'activity-2'])
    }
    poll.stop()
  })

  it('second tick sends the advanced sinceSeq', async () => {
    store.dispatchSystemView({ type: 'open', nodeId: '/wt/alpha' })
    const gateway = createFakeGateway()
    gateway.impl = async (_worktree, sinceSeq) => {
      if (sinceSeq === 0) return { events: [eventAt(1), eventAt(2)], latestSeq: 2 }
      return { events: [eventAt(3)], latestSeq: 3 }
    }
    const poll = createAgentActivityPoll({
      store,
      gateway,
      onUnsupported,
      setTimer: setTimerSpy,
      clearTimer: clearTimerSpy
    })

    poll.start('/wt/alpha')
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(AGENT_ACTIVITY_POLL_INTERVAL_MS)

    expect(gateway.calls[1]).toEqual({
      worktree: '/wt/alpha',
      sinceSeq: 2,
      limit: AGENT_ACTIVITY_POLL_LIMIT
    })
    poll.stop()
  })

  it('empty page dispatches nothing but reschedules', async () => {
    store.dispatchSystemView({ type: 'open', nodeId: '/wt/alpha' })
    const gateway = createFakeGateway({ events: [], latestSeq: 0 })
    const poll = createAgentActivityPoll({
      store,
      gateway,
      onUnsupported,
      setTimer: setTimerSpy,
      clearTimer: clearTimerSpy
    })

    poll.start('/wt/alpha')
    await vi.advanceTimersByTimeAsync(0)
    const slice = store.get().systemView
    expect(slice.view).toBe('open')
    if (slice.view === 'open') expect(slice.feed).toEqual([])

    await vi.advanceTimersByTimeAsync(AGENT_ACTIVITY_POLL_INTERVAL_MS)
    expect(gateway.calls.length).toBe(2)
    poll.stop()
  })

  it('latestSeq < cursor: resets the feed, cursor goes to 0, and still appends the returned page', async () => {
    store.dispatchSystemView({ type: 'open', nodeId: '/wt/alpha' })
    const gateway = createFakeGateway()
    gateway.impl = async (_worktree, sinceSeq) => {
      if (sinceSeq === 0) return { events: [eventAt(10)], latestSeq: 10 }
      // ring restarted: host reports a lower latestSeq than our cursor
      return { events: [eventAt(1)], latestSeq: 1 }
    }
    const poll = createAgentActivityPoll({
      store,
      gateway,
      onUnsupported,
      setTimer: setTimerSpy,
      clearTimer: clearTimerSpy
    })

    poll.start('/wt/alpha')
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(AGENT_ACTIVITY_POLL_INTERVAL_MS)

    const slice = store.get().systemView
    expect(slice.view).toBe('open')
    if (slice.view === 'open') expect(slice.feed.map((r) => r.id)).toEqual(['activity-1'])

    await vi.advanceTimersByTimeAsync(AGENT_ACTIVITY_POLL_INTERVAL_MS)
    expect(gateway.calls[2]).toEqual({
      worktree: '/wt/alpha',
      sinceSeq: 1,
      limit: AGENT_ACTIVITY_POLL_LIMIT
    })
    poll.stop()
  })

  it('start with a different worktree resets the cursor and the feed', async () => {
    store.dispatchSystemView({ type: 'open', nodeId: '/wt/alpha' })
    const gateway = createFakeGateway()
    gateway.impl = async () => ({ events: [eventAt(5)], latestSeq: 5 })
    const poll = createAgentActivityPoll({
      store,
      gateway,
      onUnsupported,
      setTimer: setTimerSpy,
      clearTimer: clearTimerSpy
    })

    poll.start('/wt/alpha')
    await vi.advanceTimersByTimeAsync(0)
    poll.stop()

    store.dispatchSystemView({ type: 'open', nodeId: '/wt/beta' })
    poll.start('/wt/beta')
    const afterRestart = store.get().systemView
    expect(afterRestart.view).toBe('open')
    if (afterRestart.view === 'open') expect(afterRestart.feed).toEqual([])

    await vi.advanceTimersByTimeAsync(0)
    expect(gateway.calls.at(-1)).toEqual({
      worktree: '/wt/beta',
      sinceSeq: 0,
      limit: AGENT_ACTIVITY_POLL_LIMIT
    })
    poll.stop()
  })

  it('self-halts when the system view is not open: no call, no schedule', async () => {
    const gateway = createFakeGateway()
    const poll = createAgentActivityPoll({
      store,
      gateway,
      onUnsupported,
      setTimer: setTimerSpy,
      clearTimer: clearTimerSpy
    })

    poll.start('/wt/alpha')
    await vi.advanceTimersByTimeAsync(AGENT_ACTIVITY_POLL_INTERVAL_MS * 3)

    expect(gateway.calls.length).toBe(0)
  })

  it('mid-flight close: no dispatch, no reschedule', async () => {
    store.dispatchSystemView({ type: 'open', nodeId: '/wt/alpha' })
    const gate = deferred<AgentActivityPage>()
    const gateway = createFakeGateway()
    gateway.impl = () => gate.promise
    const poll = createAgentActivityPoll({
      store,
      gateway,
      onUnsupported,
      setTimer: setTimerSpy,
      clearTimer: clearTimerSpy
    })

    poll.start('/wt/alpha')
    await vi.advanceTimersByTimeAsync(0)
    const callsBeforeClose = setTimerSpy.mock.calls.length

    store.dispatchSystemView({ type: 'close' })
    gate.resolve({ events: [eventAt(1)], latestSeq: 1 })
    await vi.advanceTimersByTimeAsync(0)

    expect(store.get().systemView).toEqual({ view: 'closed' })
    expect(setTimerSpy.mock.calls.length).toBe(callsBeforeClose)

    await vi.advanceTimersByTimeAsync(AGENT_ACTIVITY_POLL_INTERVAL_MS * 5)
    expect(gateway.calls.length).toBe(1)
  })

  it('method_not_found: onUnsupported exactly once, no further calls, no reset-feed', async () => {
    store.dispatchSystemView({ type: 'open', nodeId: '/wt/alpha' })
    const gateway = createFakeGateway()
    gateway.impl = async () => {
      throw new RpcCallError('method_not_found', "Unknown method 'agent.activity'.")
    }
    const poll = createAgentActivityPoll({
      store,
      gateway,
      onUnsupported,
      setTimer: setTimerSpy,
      clearTimer: clearTimerSpy
    })

    poll.start('/wt/alpha')
    await vi.advanceTimersByTimeAsync(0)
    expect(onUnsupported).toHaveBeenCalledTimes(1)
    const slice = store.get().systemView
    expect(slice.view).toBe('open')
    if (slice.view === 'open') expect(slice.feed).toEqual([]) // no reset-feed dispatched

    await vi.advanceTimersByTimeAsync(AGENT_ACTIVITY_POLL_INTERVAL_MS * 3)
    expect(gateway.calls.length).toBe(1)
    expect(onUnsupported).toHaveBeenCalledTimes(1)
  })

  it('a transient error keeps the feed and retries on cadence', async () => {
    store.dispatchSystemView({ type: 'open', nodeId: '/wt/alpha' })
    const gateway = createFakeGateway()
    gateway.impl = async () => {
      throw new Error('network blip')
    }
    const poll = createAgentActivityPoll({
      store,
      gateway,
      onUnsupported,
      setTimer: setTimerSpy,
      clearTimer: clearTimerSpy
    })

    poll.start('/wt/alpha')
    await vi.advanceTimersByTimeAsync(0)
    expect(gateway.calls.length).toBe(1)
    expect(onUnsupported).not.toHaveBeenCalled()
    expect(store.get().systemView.view).toBe('open')

    await vi.advanceTimersByTimeAsync(AGENT_ACTIVITY_POLL_INTERVAL_MS)
    expect(gateway.calls.length).toBe(2)
    poll.stop()
  })

  it('stop() clears the pending timer', async () => {
    store.dispatchSystemView({ type: 'open', nodeId: '/wt/alpha' })
    const gateway = createFakeGateway()
    const poll = createAgentActivityPoll({
      store,
      gateway,
      onUnsupported,
      setTimer: setTimerSpy,
      clearTimer: clearTimerSpy
    })

    poll.start('/wt/alpha')
    await vi.advanceTimersByTimeAsync(0)
    expect(gateway.calls.length).toBe(1)

    poll.stop()
    expect(clearTimerSpy).toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(AGENT_ACTIVITY_POLL_INTERVAL_MS * 5)
    expect(gateway.calls.length).toBe(1)
  })

  it('rebindGateway swaps the gateway used by the next tick', async () => {
    store.dispatchSystemView({ type: 'open', nodeId: '/wt/alpha' })
    const gatewayA = createFakeGateway()
    const gatewayB = createFakeGateway()
    const poll = createAgentActivityPoll({
      store,
      gateway: gatewayA,
      onUnsupported,
      setTimer: setTimerSpy,
      clearTimer: clearTimerSpy
    })

    poll.start('/wt/alpha')
    await vi.advanceTimersByTimeAsync(0)
    expect(gatewayA.calls.length).toBe(1)
    expect(gatewayB.calls.length).toBe(0)

    poll.rebindGateway(gatewayB)
    await vi.advanceTimersByTimeAsync(AGENT_ACTIVITY_POLL_INTERVAL_MS)
    expect(gatewayA.calls.length).toBe(1)
    expect(gatewayB.calls.length).toBe(1)
    poll.stop()
  })
})
