import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createLiveWorktreeSync, LIVE_SYNC_POLL_INTERVAL_MS } from './live-worktree-sync'
import type { LiveSyncConnection, LiveSyncDeps } from './live-worktree-sync'
import { createSceneStore } from './scene-store'
import { RECONNECT_MAX_ATTEMPTS } from './reconnect-backoff'
import type { SceneStore } from './scene-store'
import type { RawWorktreeRecord } from '../domain/worktree-graph/build-graph'

const records: RawWorktreeRecord[] = [
  {
    id: 'repo::/a',
    branch: 'refs/heads/main',
    parentWorktreeId: null,
    childWorktreeIds: [],
    workspaceStatus: 'in-progress',
    git: { path: '/a', isMainWorktree: true }
  }
]

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

/** Fake terminals port: reconnect-hook tests only assert identity, never call these. */
function createFakeTerminalsPort(): LiveSyncConnection['terminals'] {
  return {
    createTerminal: async () => ({ terminal: 'fake' }),
    subscribe: () => {},
    sendInput: () => {},
    sendResize: () => {},
    unsubscribe: () => {},
    close: async () => {}
  }
}

/** Fake connection: `listWorktrees` resolution timing and `runtimeId` are test-controlled. */
function createFakeConnection(overrides?: {
  runtimeId?: string
  listWorktrees?: () => Promise<RawWorktreeRecord[]>
}): LiveSyncConnection & {
  listWorktreesCalls: number
  closed: boolean
  emitClose(reason: string): void
} {
  const closeHandlers: ((reason: string) => void)[] = []
  const connection = {
    listWorktreesCalls: 0,
    closed: false,
    // `exactOptionalPropertyTypes` forbids assigning `undefined` — omit the key entirely instead.
    ...(overrides?.runtimeId !== undefined ? { runtimeId: overrides.runtimeId } : {}),
    gateway: {
      listWorktrees: async () => {
        connection.listWorktreesCalls += 1
        if (overrides?.listWorktrees) return overrides.listWorktrees()
        return records
      }
    },
    terminals: createFakeTerminalsPort(),
    close() {
      connection.closed = true
    },
    onClose(cb: (reason: string) => void) {
      closeHandlers.push(cb)
    },
    emitClose(reason: string) {
      for (const cb of [...closeHandlers]) cb(reason)
    }
  }
  return connection
}

describe('createLiveWorktreeSync', () => {
  let store: SceneStore
  let setTimerSpy: ReturnType<typeof vi.fn>
  let clearTimerSpy: ReturnType<typeof vi.fn>
  let hidden: boolean
  let visibilityCb: (() => void) | undefined
  let random: () => number

  const baseDeps = (connect: LiveSyncDeps['connect']): LiveSyncDeps => ({
    connect,
    store,
    random: () => random(),
    setTimer: setTimerSpy,
    clearTimer: clearTimerSpy,
    isDocumentHidden: () => hidden,
    onVisibilityChange: (cb) => {
      visibilityCb = cb
      return () => {
        visibilityCb = undefined
      }
    }
  })

  beforeEach(() => {
    vi.useFakeTimers()
    store = createSceneStore()
    hidden = false
    visibilityCb = undefined
    random = () => 0.5
    setTimerSpy = vi.fn((fn: () => void, ms: number) => setTimeout(fn, ms))
    clearTimerSpy = vi.fn((handle: unknown) =>
      clearTimeout(handle as ReturnType<typeof setTimeout>)
    )
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('sets connecting immediately on start, then connected{runtimeId} only once the first poll succeeds and reports a runtimeId', async () => {
    const connection = createFakeConnection({ runtimeId: 'rt-1' })
    const sync = createLiveWorktreeSync(baseDeps(async () => connection))
    sync.start()
    expect(store.get().connection).toEqual({ state: 'connecting' })
    await vi.advanceTimersByTimeAsync(0)
    expect(store.get().connection).toEqual({ state: 'connected', runtimeId: 'rt-1' })
    sync.stop()
  })

  it('CO-501 cadence: advancing time by the poll interval triggers exactly one more poll', async () => {
    const connection = createFakeConnection({ runtimeId: 'rt-1' })
    const sync = createLiveWorktreeSync(baseDeps(async () => connection))
    sync.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(connection.listWorktreesCalls).toBe(1)
    await vi.advanceTimersByTimeAsync(LIVE_SYNC_POLL_INTERVAL_MS)
    expect(connection.listWorktreesCalls).toBe(2)
    await vi.advanceTimersByTimeAsync(LIVE_SYNC_POLL_INTERVAL_MS)
    expect(connection.listWorktreesCalls).toBe(3)
    sync.stop()
  })

  it('CO-502 chains the next poll only after the previous one settles — no overlap when a poll outruns the interval', async () => {
    const slow = deferred<RawWorktreeRecord[]>()
    const connection = createFakeConnection({
      runtimeId: 'rt-1',
      listWorktrees: () => slow.promise
    })
    const sync = createLiveWorktreeSync(baseDeps(async () => connection))
    sync.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(connection.listWorktreesCalls).toBe(1)

    // Poll outruns 3x the interval: no second poll starts and no timer pile-up while pending.
    await vi.advanceTimersByTimeAsync(LIVE_SYNC_POLL_INTERVAL_MS * 3)
    expect(connection.listWorktreesCalls).toBe(1)
    const callsBeforeSettle = setTimerSpy.mock.calls.length

    slow.resolve(records)
    await vi.advanceTimersByTimeAsync(0)
    // The next timer is only scheduled now, after the in-flight promise settled.
    expect(setTimerSpy.mock.calls.length).toBeGreaterThan(callsBeforeSettle)

    await vi.advanceTimersByTimeAsync(LIVE_SYNC_POLL_INTERVAL_MS)
    expect(connection.listWorktreesCalls).toBe(2)
    sync.stop()
  })

  it('CO-504 hidden pauses scheduling; visible resumes immediately and resets the reconnect attempt', async () => {
    const connection = createFakeConnection({ runtimeId: 'rt-1' })
    const sync = createLiveWorktreeSync(baseDeps(async () => connection))
    sync.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(connection.listWorktreesCalls).toBe(1)

    hidden = true
    await vi.advanceTimersByTimeAsync(LIVE_SYNC_POLL_INTERVAL_MS * 5)
    expect(connection.listWorktreesCalls).toBe(1) // no further polls scheduled while hidden

    const callsBeforeVisible = setTimerSpy.mock.calls.length
    hidden = false
    visibilityCb?.()
    await vi.advanceTimersByTimeAsync(0)
    // Polls immediately — not waiting for the next interval.
    expect(connection.listWorktreesCalls).toBe(2)
    expect(setTimerSpy.mock.calls.length).toBeGreaterThanOrEqual(callsBeforeVisible)
    sync.stop()
  })

  it('visible resets the reconnect attempt counter: a pending reconnect wait is skipped and the next failure restarts at attempt 1', async () => {
    let connectCalls = 0
    const liveConnection: {
      current: (LiveSyncConnection & { emitClose(reason: string): void }) | null
    } = {
      current: null
    }
    const connect = async () => {
      connectCalls += 1
      liveConnection.current = createFakeConnection({ runtimeId: 'rt-1' })
      return liveConnection.current
    }
    const sync = createLiveWorktreeSync(baseDeps(connect))
    sync.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(connectCalls).toBe(1)

    liveConnection.current?.emitClose('remote_runtime_unavailable')
    const firstReconnect = store.get().connection
    expect(firstReconnect).toMatchObject({ state: 'reconnecting', attempt: 1 })

    // Visible fires while still waiting on the backoff timer: connects immediately, doesn't wait.
    visibilityCb?.()
    await vi.advanceTimersByTimeAsync(0)
    expect(connectCalls).toBe(2)
    expect(store.get().connection).toEqual({ state: 'connected', runtimeId: 'rt-1' })

    // A fresh failure after the visible-triggered reconnect restarts the count at attempt 1,
    // proving the counter was reset rather than continuing from the prior sequence.
    liveConnection.current?.emitClose('remote_runtime_unavailable')
    expect(store.get().connection).toMatchObject({ state: 'reconnecting', attempt: 1 })
    sync.stop()
  })

  it('keeps polling at the normal interval without backing off when a poll fails at the RPC level (socket healthy)', async () => {
    let call = 0
    const connection = createFakeConnection({
      runtimeId: 'rt-1',
      listWorktrees: async () => {
        call += 1
        if (call === 1) {
          throw Object.assign(new Error('boom'), { code: 'repo_not_found' })
        }
        return records
      }
    })
    const sync = createLiveWorktreeSync(baseDeps(async () => connection))
    sync.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(store.get().sync).toMatchObject({ state: 'error', code: 'repo_not_found' })
    // Connection never flips to connected because the first poll did not succeed...
    expect(store.get().connection).toEqual({ state: 'connecting' })
    // ...but polling continues undeterred, at the normal interval, no backoff/reconnecting state.
    await vi.advanceTimersByTimeAsync(LIVE_SYNC_POLL_INTERVAL_MS)
    expect(connection.listWorktreesCalls).toBe(2)
    expect(store.get().connection).toEqual({ state: 'connected', runtimeId: 'rt-1' })
    sync.stop()
  })

  it('jitters the poll delay within ±10% of the interval across several random seeds', async () => {
    for (const seed of [0, 0.25, 0.5, 0.75, 1]) {
      random = () => seed
      const connection = createFakeConnection({ runtimeId: 'rt-1' })
      const localSpy = vi.fn((fn: () => void, ms: number) => setTimeout(fn, ms))
      const sync = createLiveWorktreeSync({
        ...baseDeps(async () => connection),
        setTimer: localSpy
      })
      sync.start()
      await vi.advanceTimersByTimeAsync(0)
      const delays = localSpy.mock.calls.map(([, ms]) => ms as number)
      for (const ms of delays) {
        expect(ms).toBeGreaterThanOrEqual(LIVE_SYNC_POLL_INTERVAL_MS * 0.9)
        expect(ms).toBeLessThanOrEqual(LIVE_SYNC_POLL_INTERVAL_MS * 1.1)
      }
      sync.stop()
    }
  })

  it('CO-505: transport loss drives reconnecting{attempt,nextRetryInMs} through reconnect-backoff', async () => {
    let connectCalls = 0
    const liveConnection: { current: ReturnType<typeof createFakeConnection> | null } = {
      current: null
    }
    const connect = async () => {
      connectCalls += 1
      liveConnection.current = createFakeConnection({ runtimeId: 'rt-1' })
      return liveConnection.current
    }
    const sync = createLiveWorktreeSync(baseDeps(connect))
    sync.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(store.get().connection).toEqual({ state: 'connected', runtimeId: 'rt-1' })
    expect(connectCalls).toBe(1)

    liveConnection.current?.emitClose('remote_runtime_unavailable')
    const state = store.get().connection
    expect(state.state).toBe('reconnecting')
    if (state.state === 'reconnecting') {
      expect(state.attempt).toBe(1)
      expect(state.nextRetryInMs).toBeGreaterThan(0)
      await vi.advanceTimersByTimeAsync(state.nextRetryInMs)
    }
    expect(connectCalls).toBe(2)
    expect(store.get().connection).toEqual({ state: 'connected', runtimeId: 'rt-1' })
    sync.stop()
  })

  it('CO-505: a non-retryable close code goes straight to down{reason}, skipping reconnect entirely', async () => {
    const connection = createFakeConnection({ runtimeId: 'rt-1' })
    const sync = createLiveWorktreeSync(baseDeps(async () => connection))
    sync.start()
    await vi.advanceTimersByTimeAsync(0)

    connection.emitClose('unauthorized')
    expect(store.get().connection).toEqual({ state: 'down', reason: 'orcad rechazó el token' })
    sync.stop()
  })

  it('CO-505: retry-budget exhaustion (every reconnect attempt itself fails) eventually lands on down{reason}', async () => {
    let connectCalls = 0
    const initialConnection: { current: ReturnType<typeof createFakeConnection> | null } = {
      current: null
    }
    const connect = async () => {
      connectCalls += 1
      if (connectCalls === 1) {
        initialConnection.current = createFakeConnection({ runtimeId: 'rt-1' })
        return initialConnection.current
      }
      // Every reconnect attempt after the first fails outright — a success would reset the
      // attempt counter by design (D4), so exhaustion requires the retries themselves to fail.
      throw Object.assign(new Error('still down'), { code: 'remote_runtime_unavailable' })
    }
    const sync = createLiveWorktreeSync(baseDeps(connect))
    sync.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(store.get().connection).toEqual({ state: 'connected', runtimeId: 'rt-1' })

    initialConnection.current?.emitClose('remote_runtime_unavailable')
    for (let i = 0; i < RECONNECT_MAX_ATTEMPTS + 1; i++) {
      const state = store.get().connection
      if (state.state !== 'reconnecting') break
      await vi.advanceTimersByTimeAsync(state.nextRetryInMs)
    }
    expect(store.get().connection).toEqual({ state: 'down', reason: 'orcad no responde' })
    sync.stop()
  })

  it('no overlapping polls: setTimer is only ever called again after the prior poll promise resolves', async () => {
    let resolveCount = 0
    const gates: Deferred<RawWorktreeRecord[]>[] = []
    const connection = createFakeConnection({
      runtimeId: 'rt-1',
      listWorktrees: () => {
        const gate = deferred<RawWorktreeRecord[]>()
        gates.push(gate)
        return gate.promise
      }
    })
    const sync = createLiveWorktreeSync(baseDeps(async () => connection))
    sync.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(gates.length).toBe(1)
    const callsWhilePending = setTimerSpy.mock.calls.length
    await vi.advanceTimersByTimeAsync(LIVE_SYNC_POLL_INTERVAL_MS * 10)
    expect(setTimerSpy.mock.calls.length).toBe(callsWhilePending) // no new timer scheduled while pending
    gates[0]?.resolve(records)
    resolveCount += 1
    await vi.advanceTimersByTimeAsync(0)
    expect(setTimerSpy.mock.calls.length).toBeGreaterThan(callsWhilePending)
    expect(resolveCount).toBe(1)
    sync.stop()
  })

  it('P3.5: calls onConnected with the fresh connection (terminals port included) after each successful connect', async () => {
    const connection = createFakeConnection({ runtimeId: 'rt-1' })
    const onConnected = vi.fn()
    const sync = createLiveWorktreeSync({ ...baseDeps(async () => connection), onConnected })
    sync.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(onConnected).toHaveBeenCalledTimes(1)
    expect(onConnected).toHaveBeenCalledWith(connection)
    expect(onConnected.mock.calls[0]?.[0]?.terminals).toBe(connection.terminals)
    sync.stop()
  })

  it('P3.5: calls onDisconnected on connection loss, then onConnected again once reconnected — so a terminal layer can re-subscribe active sessions on the fresh port', async () => {
    let connectCalls = 0
    const liveConnection: { current: ReturnType<typeof createFakeConnection> | null } = {
      current: null
    }
    const connect = async () => {
      connectCalls += 1
      liveConnection.current = createFakeConnection({ runtimeId: 'rt-1' })
      return liveConnection.current
    }
    const onConnected = vi.fn()
    const onDisconnected = vi.fn()
    const sync = createLiveWorktreeSync({ ...baseDeps(connect), onConnected, onDisconnected })
    sync.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(onConnected).toHaveBeenCalledTimes(1)
    const firstConnection = liveConnection.current

    liveConnection.current?.emitClose('remote_runtime_unavailable')
    expect(onDisconnected).toHaveBeenCalledTimes(1)
    expect(onConnected).toHaveBeenCalledTimes(1) // not re-fired until a new connection actually lands

    const state = store.get().connection
    if (state.state === 'reconnecting') {
      await vi.advanceTimersByTimeAsync(state.nextRetryInMs)
    }
    expect(connectCalls).toBe(2)
    expect(onConnected).toHaveBeenCalledTimes(2)
    expect(onConnected.mock.calls[1]?.[0]).not.toBe(firstConnection)
    sync.stop()
  })

  it('P3.5: onConnected/onDisconnected are optional — omitting them changes nothing', async () => {
    const connection = createFakeConnection({ runtimeId: 'rt-1' })
    const sync = createLiveWorktreeSync(baseDeps(async () => connection))
    sync.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(store.get().connection).toEqual({ state: 'connected', runtimeId: 'rt-1' })
    expect(() => connection.emitClose('unauthorized')).not.toThrow()
    sync.stop()
  })

  it('stop() clears the pending timer, unsubscribes visibility, and closes the active connection', async () => {
    const connection = createFakeConnection({ runtimeId: 'rt-1' })
    const sync = createLiveWorktreeSync(baseDeps(async () => connection))
    sync.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(visibilityCb).toBeDefined()
    sync.stop()
    expect(connection.closed).toBe(true)
    expect(visibilityCb).toBeUndefined()
    await vi.advanceTimersByTimeAsync(LIVE_SYNC_POLL_INTERVAL_MS * 5)
    expect(connection.listWorktreesCalls).toBe(1) // no more polls after stop
  })
})
