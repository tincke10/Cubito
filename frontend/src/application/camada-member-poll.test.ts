import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createCamadaMemberPoll, CAMADA_POLL_INTERVAL_MS } from './camada-member-poll'
import type { CamadaPollGatewayPort } from './camada-member-poll'
import { createSceneStore } from './scene-store'
import type { SceneStore } from './scene-store'
import type { FanOutBatchEntry, FanOutSlice } from './fan-out-model'
import type {
  LeaseWorkerListResult,
  LeaseWorkerShowResult,
  WorkerDispatchStateRow,
  WorktreePsRow
} from './ports/runtime-gateway'
import type { AgentStatus } from '../domain/worktree-graph/node-activity'
import type { WorktreeId } from '../domain/worktree-graph/types'

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

const runningSlice = (memberStatus: Record<WorktreeId, AgentStatus> = {}): FanOutSlice => ({
  view: 'running',
  parentId: 'repo::/parent',
  fields: { count: 2, agent: 'none', prompt: '' },
  repoSelector: 'repo',
  batch: [
    { mutationId: 'm1', worktreeId: 'repo::/child', failed: false, dispatchId: null, taskId: null }
  ],
  memberStatus,
  runId: null
})

const liveRow = (dispatchId: string): WorkerDispatchStateRow => ({
  dispatchId,
  workerState: 'ready',
  dispatchStatus: 'dispatched',
  worktreeId: null
})

const leaseRunningSlice = (
  batch: readonly FanOutBatchEntry[],
  memberStatus: Record<WorktreeId, AgentStatus> = {}
): FanOutSlice => ({
  view: 'running',
  parentId: 'repo::/parent',
  fields: { count: batch.length, agent: 'claude', prompt: '' },
  repoSelector: 'repo',
  batch,
  memberStatus,
  runId: 'run-1'
})

type FakeGateway = CamadaPollGatewayPort & {
  calls: number
  workerListCalls: number
  workerShowCalls: number
  workerShowDispatchIds: string[]
  listWorktreePsImpl?: () => Promise<readonly WorktreePsRow[]>
  orchestrationWorkerListImpl?: () => Promise<LeaseWorkerListResult>
  orchestrationWorkerShowImpl?: (dispatchId: string) => Promise<LeaseWorkerShowResult>
}

/** Fake gateway: `listWorktreePs`/`orchestrationWorkerList`/`orchestrationWorkerShow` resolution
 *  timing and payloads are test-controlled. */
function createFakeGateway(
  rows: readonly WorktreePsRow[] = [],
  workers: readonly WorkerDispatchStateRow[] = []
): FakeGateway {
  const gw: FakeGateway = {
    calls: 0,
    workerListCalls: 0,
    workerShowCalls: 0,
    workerShowDispatchIds: [],
    listWorktreePs: async () => {
      gw.calls += 1
      if (gw.listWorktreePsImpl) return gw.listWorktreePsImpl()
      return rows
    },
    orchestrationWorkerList: async () => {
      gw.workerListCalls += 1
      if (gw.orchestrationWorkerListImpl) return gw.orchestrationWorkerListImpl()
      return { workers }
    },
    orchestrationWorkerShow: async ({ dispatch }) => {
      gw.workerShowCalls += 1
      gw.workerShowDispatchIds.push(dispatch)
      if (gw.orchestrationWorkerShowImpl) return gw.orchestrationWorkerShowImpl(dispatch)
      return { awaitingInput: null }
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

  describe('lease Run backing the batch (runId !== null): orchestration.workerList branch', () => {
    it('polls orchestrationWorkerList({run}) instead of listWorktreePs when runId is set', async () => {
      const gateway = createFakeGateway([{ worktreeId: 'repo::/child', status: 'working' }])
      const batch: FanOutBatchEntry[] = [
        {
          mutationId: 'm1',
          worktreeId: 'repo::/child',
          failed: false,
          dispatchId: 'dispatch-1',
          taskId: 'task-1'
        }
      ]
      store.update({ fanOut: leaseRunningSlice(batch) })
      const poll = createCamadaMemberPoll({
        gateway,
        store,
        setTimer: setTimerSpy,
        clearTimer: clearTimerSpy
      })
      poll.start()
      await vi.advanceTimersByTimeAsync(0)
      expect(gateway.workerListCalls).toBe(1)
      expect(gateway.calls).toBe(0)
      poll.stop()
    })

    it('maps a row to member-status via dispatchId -> entry.worktreeId correlation', async () => {
      const gateway = createFakeGateway(
        [],
        [
          {
            dispatchId: 'dispatch-1',
            workerState: 'ready',
            dispatchStatus: 'dispatched',
            worktreeId: null
          }
        ]
      )
      const batch: FanOutBatchEntry[] = [
        {
          mutationId: 'm1',
          worktreeId: 'repo::/child',
          failed: false,
          dispatchId: 'dispatch-1',
          taskId: 'task-1'
        }
      ]
      store.update({ fanOut: leaseRunningSlice(batch) })
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
        expect(slice.memberStatus).toEqual({ 'repo::/child': 'working' })
      }
      poll.stop()
    })

    it('a failed row dispatches child-failed keyed by mutationId, not member-status', async () => {
      const gateway = createFakeGateway(
        [],
        [
          {
            dispatchId: 'dispatch-1',
            workerState: 'failed',
            dispatchStatus: 'dispatched',
            worktreeId: null
          }
        ]
      )
      const batch: FanOutBatchEntry[] = [
        {
          mutationId: 'm1',
          worktreeId: 'repo::/child',
          failed: false,
          dispatchId: 'dispatch-1',
          taskId: 'task-1'
        }
      ]
      store.update({ fanOut: leaseRunningSlice(batch) })
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
        expect(slice.batch[0]?.failed).toBe(true)
        expect(slice.memberStatus).toEqual({})
      }
      poll.stop()
    })

    it('skips a row whose dispatchId matches no batch entry', async () => {
      const gateway = createFakeGateway(
        [],
        [
          {
            dispatchId: 'unknown-dispatch',
            workerState: 'ready',
            dispatchStatus: 'dispatched',
            worktreeId: null
          }
        ]
      )
      const batch: FanOutBatchEntry[] = [
        {
          mutationId: 'm1',
          worktreeId: 'repo::/child',
          failed: false,
          dispatchId: 'dispatch-1',
          taskId: 'task-1'
        }
      ]
      store.update({ fanOut: leaseRunningSlice(batch) })
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
        expect(slice.memberStatus).toEqual({})
      }
      poll.stop()
    })

    it('a workerList throw still schedules the next tick — loss-of-contact is not process death', async () => {
      const gateway = createFakeGateway()
      gateway.orchestrationWorkerListImpl = () => Promise.reject(new Error('network blip'))
      const batch: FanOutBatchEntry[] = [
        {
          mutationId: 'm1',
          worktreeId: 'repo::/child',
          failed: false,
          dispatchId: 'dispatch-1',
          taskId: 'task-1'
        }
      ]
      store.update({ fanOut: leaseRunningSlice(batch) })
      const poll = createCamadaMemberPoll({
        gateway,
        store,
        setTimer: setTimerSpy,
        clearTimer: clearTimerSpy
      })
      poll.start()
      await vi.advanceTimersByTimeAsync(0)
      expect(gateway.workerListCalls).toBe(1)
      // slice untouched by the failed poll, but the loop is still alive
      expect(store.get().fanOut).toEqual(leaseRunningSlice(batch))

      await vi.advanceTimersByTimeAsync(CAMADA_POLL_INTERVAL_MS)
      expect(gateway.workerListCalls).toBe(2) // next tick was scheduled despite the throw
      poll.stop()
    })

    it('stop() during an in-flight workerList throw does not schedule a next tick', async () => {
      const gate = deferred<LeaseWorkerListResult>()
      const gateway = createFakeGateway()
      gateway.orchestrationWorkerListImpl = () => gate.promise
      const batch: FanOutBatchEntry[] = [
        {
          mutationId: 'm1',
          worktreeId: 'repo::/child',
          failed: false,
          dispatchId: 'dispatch-1',
          taskId: 'task-1'
        }
      ]
      store.update({ fanOut: leaseRunningSlice(batch) })
      const poll = createCamadaMemberPoll({
        gateway,
        store,
        setTimer: setTimerSpy,
        clearTimer: clearTimerSpy
      })
      poll.start()
      await vi.advanceTimersByTimeAsync(0)
      const callsBeforeStop = setTimerSpy.mock.calls.length
      poll.stop()
      gate.reject(new Error('network blip'))
      await vi.advanceTimersByTimeAsync(0)
      expect(setTimerSpy.mock.calls.length).toBe(callsBeforeStop)
    })
  })

  describe('MINIMAL+: orchestration.workerShow recovers esperando/waiting-input', () => {
    it('a live dispatch with awaitingInput:true surfaces waiting-input instead of working', async () => {
      const gateway = createFakeGateway([], [liveRow('dispatch-1')])
      gateway.orchestrationWorkerShowImpl = async () => ({ awaitingInput: true })
      const batch: FanOutBatchEntry[] = [
        {
          mutationId: 'm1',
          worktreeId: 'repo::/child',
          failed: false,
          dispatchId: 'dispatch-1',
          taskId: 'task-1'
        }
      ]
      store.update({ fanOut: leaseRunningSlice(batch) })
      const poll = createCamadaMemberPoll({
        gateway,
        store,
        setTimer: setTimerSpy,
        clearTimer: clearTimerSpy
      })
      poll.start()
      await vi.advanceTimersByTimeAsync(0)
      expect(gateway.workerShowDispatchIds).toEqual(['dispatch-1'])
      const slice = store.get().fanOut
      if (slice.view === 'running') {
        expect(slice.memberStatus).toEqual({ 'repo::/child': 'waiting-input' })
      }
      poll.stop()
    })

    it.each([
      ['false (observed, not waiting)', false],
      ['null (never looked)', null]
    ] as const)('awaitingInput: %s keeps the working status', async (_label, awaitingInput) => {
      const gateway = createFakeGateway([], [liveRow('dispatch-1')])
      gateway.orchestrationWorkerShowImpl = async () => ({ awaitingInput })
      const batch: FanOutBatchEntry[] = [
        {
          mutationId: 'm1',
          worktreeId: 'repo::/child',
          failed: false,
          dispatchId: 'dispatch-1',
          taskId: 'task-1'
        }
      ]
      store.update({ fanOut: leaseRunningSlice(batch) })
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
        expect(slice.memberStatus).toEqual({ 'repo::/child': 'working' })
      }
      poll.stop()
    })

    it('does not call workerShow for a terminal (non-working) dispatch', async () => {
      const gateway = createFakeGateway(
        [],
        [
          {
            dispatchId: 'dispatch-1',
            workerState: 'succeeded',
            dispatchStatus: 'completed',
            worktreeId: null
          }
        ]
      )
      const batch: FanOutBatchEntry[] = [
        {
          mutationId: 'm1',
          worktreeId: 'repo::/child',
          failed: false,
          dispatchId: 'dispatch-1',
          taskId: 'task-1'
        }
      ]
      store.update({ fanOut: leaseRunningSlice(batch) })
      const poll = createCamadaMemberPoll({
        gateway,
        store,
        setTimer: setTimerSpy,
        clearTimer: clearTimerSpy
      })
      poll.start()
      await vi.advanceTimersByTimeAsync(0)
      expect(gateway.workerShowCalls).toBe(0)
      poll.stop()
    })

    it('does not call workerShow for a failed dispatch', async () => {
      const gateway = createFakeGateway(
        [],
        [
          {
            dispatchId: 'dispatch-1',
            workerState: 'failed',
            dispatchStatus: 'dispatched',
            worktreeId: null
          }
        ]
      )
      const batch: FanOutBatchEntry[] = [
        {
          mutationId: 'm1',
          worktreeId: 'repo::/child',
          failed: false,
          dispatchId: 'dispatch-1',
          taskId: 'task-1'
        }
      ]
      store.update({ fanOut: leaseRunningSlice(batch) })
      const poll = createCamadaMemberPoll({
        gateway,
        store,
        setTimer: setTimerSpy,
        clearTimer: clearTimerSpy
      })
      poll.start()
      await vi.advanceTimersByTimeAsync(0)
      expect(gateway.workerShowCalls).toBe(0)
      poll.stop()
    })

    it('a workerShow throw for one dispatch does not affect another cube nor kill the loop', async () => {
      const gateway = createFakeGateway([], [liveRow('dispatch-1'), liveRow('dispatch-2')])
      gateway.orchestrationWorkerShowImpl = async (dispatchId) => {
        if (dispatchId === 'dispatch-1') throw new Error('unreadable pane')
        return { awaitingInput: true }
      }
      const batch: FanOutBatchEntry[] = [
        {
          mutationId: 'm1',
          worktreeId: 'repo::/child-1',
          failed: false,
          dispatchId: 'dispatch-1',
          taskId: 'task-1'
        },
        {
          mutationId: 'm2',
          worktreeId: 'repo::/child-2',
          failed: false,
          dispatchId: 'dispatch-2',
          taskId: 'task-2'
        }
      ]
      store.update({ fanOut: leaseRunningSlice(batch) })
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
        // dispatch-1 kept its workerList-derived status; dispatch-2 still recovered esperando
        expect(slice.memberStatus).toEqual({
          'repo::/child-1': 'working',
          'repo::/child-2': 'waiting-input'
        })
      }

      await vi.advanceTimersByTimeAsync(CAMADA_POLL_INTERVAL_MS)
      expect(gateway.workerListCalls).toBe(2) // next tick was scheduled despite the throw
      poll.stop()
    })

    it('bounds workerShow calls to live dispatches only, not every row in the batch', async () => {
      const gateway = createFakeGateway(
        [],
        [
          liveRow('dispatch-1'),
          {
            dispatchId: 'dispatch-2',
            workerState: 'succeeded',
            dispatchStatus: 'completed',
            worktreeId: null
          }
        ]
      )
      const batch: FanOutBatchEntry[] = [
        {
          mutationId: 'm1',
          worktreeId: 'repo::/child-1',
          failed: false,
          dispatchId: 'dispatch-1',
          taskId: 'task-1'
        },
        {
          mutationId: 'm2',
          worktreeId: 'repo::/child-2',
          failed: false,
          dispatchId: 'dispatch-2',
          taskId: 'task-2'
        }
      ]
      store.update({ fanOut: leaseRunningSlice(batch) })
      const poll = createCamadaMemberPoll({
        gateway,
        store,
        setTimer: setTimerSpy,
        clearTimer: clearTimerSpy
      })
      poll.start()
      await vi.advanceTimersByTimeAsync(0)
      expect(gateway.workerShowDispatchIds).toEqual(['dispatch-1'])
      poll.stop()
    })
  })
})
