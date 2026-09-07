import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { EngineSystemGraph } from '../../../system-graph/system-graph-model'
import type { OrcaRuntimeService } from '../../orca-runtime'
import { runSystemGraphWatchStream } from './system-graph-watch-stream-lifecycle'

type Listener = () => void

const listeners = new Map<string, Set<Listener>>()
const graphs = new Map<string, EngineSystemGraph>()
const unsubscribeSpies: ReturnType<typeof vi.fn>[] = []

const ensureWatched = vi.fn(async (_worktreeId: string) => {})
const getGraph = vi.fn((worktreeId: string) => graphs.get(worktreeId))
const dispose = vi.fn(() => {
  throw new Error('must not call service.dispose')
})
const subscribe = vi.fn((worktreeId: string, listener: Listener) => {
  let set = listeners.get(worktreeId)
  if (!set) {
    set = new Set()
    listeners.set(worktreeId, set)
  }
  set.add(listener)
  const unsubscribe = vi.fn(() => set!.delete(listener))
  unsubscribeSpies.push(unsubscribe)
  return unsubscribe
})

vi.mock('../../../system-graph/runtime-system-graph-host', () => ({
  getRuntimeSystemGraphService: vi.fn(() => ({ ensureWatched, getGraph, subscribe, dispose }))
}))

function notify(worktreeId: string): void {
  for (const listener of listeners.get(worktreeId) ?? []) {
    listener()
  }
}

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

function fakeRuntime(): {
  instance: OrcaRuntimeService
  registerSubscriptionCleanup: ReturnType<typeof vi.fn>
  runCleanup: (id: string) => Promise<void>
} {
  const cleanups = new Map<string, () => void | Promise<void>>()
  const registerSubscriptionCleanup = vi.fn((id: string, cleanup: () => void | Promise<void>) => {
    cleanups.set(id, cleanup)
  })
  return {
    instance: { registerSubscriptionCleanup } as unknown as OrcaRuntimeService,
    registerSubscriptionCleanup,
    runCleanup: async (id: string) => {
      await cleanups.get(id)?.()
    }
  }
}

beforeEach(() => {
  listeners.clear()
  graphs.clear()
  unsubscribeSpies.length = 0
  ensureWatched.mockReset().mockImplementation(async () => {})
  getGraph.mockReset().mockImplementation((worktreeId: string) => graphs.get(worktreeId))
  subscribe.mockClear()
  dispose.mockClear()
})

describe('runSystemGraphWatchStream', () => {
  it('emits starting then ready carrying the serialized graph', async () => {
    const graph: EngineSystemGraph = {
      nodes: new Map([
        ['n1', { id: 'n1', kind: 'endpoint' as const, label: 'GET /x', diff: null }]
      ]),
      edges: []
    }
    graphs.set('w1', graph)
    const runtime = fakeRuntime()
    const emit = vi.fn()
    const controller = new AbortController()

    const streamPromise = runSystemGraphWatchStream({
      runtime: runtime.instance,
      worktree: 'w1',
      subscriptionId: 'sub-1',
      signal: controller.signal,
      emit
    })
    await flush()

    expect(emit).toHaveBeenNthCalledWith(1, { type: 'starting', subscriptionId: 'sub-1' })
    expect(emit).toHaveBeenNthCalledWith(2, {
      type: 'ready',
      subscriptionId: 'sub-1',
      graph: { nodes: [...graph.nodes.values()], edges: [] }
    })

    controller.abort()
    await streamPromise
  })

  it('emits one graph frame per service notification', async () => {
    const runtime = fakeRuntime()
    const emit = vi.fn()
    const controller = new AbortController()

    const streamPromise = runSystemGraphWatchStream({
      runtime: runtime.instance,
      worktree: 'w1',
      subscriptionId: 'sub-1',
      signal: controller.signal,
      emit
    })
    await flush()
    emit.mockClear()

    notify('w1')
    notify('w1')

    expect(emit.mock.calls.filter((call) => call[0].type === 'graph')).toHaveLength(2)
    expect(emit).toHaveBeenCalledWith({ type: 'graph', graph: { nodes: [], edges: [] } })

    controller.abort()
    await streamPromise
  })

  it('registers a subscription cleanup under the emitted subscriptionId', () => {
    const runtime = fakeRuntime()
    const emit = vi.fn()
    const controller = new AbortController()

    void runSystemGraphWatchStream({
      runtime: runtime.instance,
      worktree: 'w1',
      connectionId: 'conn-1',
      subscriptionId: 'sub-42',
      signal: controller.signal,
      emit
    })

    expect(runtime.registerSubscriptionCleanup).toHaveBeenCalledWith(
      'sub-42',
      expect.any(Function),
      'conn-1'
    )

    controller.abort()
  })

  it('emits nothing and registers no cleanup when the signal is already aborted', async () => {
    const runtime = fakeRuntime()
    const emit = vi.fn()
    const controller = new AbortController()
    controller.abort()

    await runSystemGraphWatchStream({
      runtime: runtime.instance,
      worktree: 'w1',
      subscriptionId: 'sub-1',
      signal: controller.signal,
      emit
    })

    expect(emit).not.toHaveBeenCalled()
    expect(runtime.registerSubscriptionCleanup).not.toHaveBeenCalled()
  })

  it('unsubscribes and emits end exactly once when aborted after ready', async () => {
    const runtime = fakeRuntime()
    const emit = vi.fn()
    const controller = new AbortController()

    const streamPromise = runSystemGraphWatchStream({
      runtime: runtime.instance,
      worktree: 'w1',
      subscriptionId: 'sub-1',
      signal: controller.signal,
      emit
    })
    await flush()
    const unsubscribeSpy = unsubscribeSpies.at(-1)!

    controller.abort()
    await streamPromise

    expect(unsubscribeSpy).toHaveBeenCalledTimes(1)
    expect(emit.mock.calls.filter((call) => call[0].type === 'end')).toHaveLength(1)
  })

  it('emits end once and stops further graph frames on cleanup via runtime (system.unwatch)', async () => {
    const runtime = fakeRuntime()
    const emit = vi.fn()

    const streamPromise = runSystemGraphWatchStream({
      runtime: runtime.instance,
      worktree: 'w1',
      subscriptionId: 'sub-1',
      emit
    })
    await flush()

    await runtime.runCleanup('sub-1')
    await streamPromise
    emit.mockClear()

    notify('w1')

    expect(emit).not.toHaveBeenCalled()
  })

  it('does not call service.dispose on cleanup', async () => {
    const runtime = fakeRuntime()
    const emit = vi.fn()
    const controller = new AbortController()

    const streamPromise = runSystemGraphWatchStream({
      runtime: runtime.instance,
      worktree: 'w1',
      subscriptionId: 'sub-1',
      signal: controller.signal,
      emit
    })
    await flush()

    controller.abort()
    await expect(streamPromise).resolves.toBeUndefined()
    expect(dispose).not.toHaveBeenCalled()
  })

  it('emits error then end and resolves without throwing when ensureWatched rejects', async () => {
    ensureWatched.mockRejectedValueOnce(new Error('boom'))
    const runtime = fakeRuntime()
    const emit = vi.fn()

    await expect(
      runSystemGraphWatchStream({
        runtime: runtime.instance,
        worktree: 'w1',
        subscriptionId: 'sub-1',
        emit
      })
    ).resolves.toBeUndefined()

    expect(emit.mock.calls.map((call) => call[0].type)).toEqual(['starting', 'error', 'end'])
    expect(emit).toHaveBeenCalledWith({ type: 'error', message: 'boom' })
  })

  it('does not emit for a notification that arrives after cleanup', async () => {
    const runtime = fakeRuntime()
    const emit = vi.fn()
    const controller = new AbortController()

    const streamPromise = runSystemGraphWatchStream({
      runtime: runtime.instance,
      worktree: 'w1',
      subscriptionId: 'sub-1',
      signal: controller.signal,
      emit
    })
    await flush()
    controller.abort()
    await streamPromise
    emit.mockClear()

    notify('w1')

    expect(emit).not.toHaveBeenCalled()
  })
})
