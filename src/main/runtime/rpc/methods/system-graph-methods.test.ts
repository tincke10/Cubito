import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { OrcaRuntimeService } from '../../orca-runtime'
import { isStreamingMethod } from '../core'
import type { EngineSystemGraph } from '../../../system-graph/system-graph-model'
import { SYSTEM_GRAPH_METHODS } from './system-graph-methods'
import { ALL_RPC_METHODS } from './index'

const ensureWatched = vi.fn(async (_worktreeId: string) => {})
const getGraph = vi.fn<(worktreeId: string) => EngineSystemGraph | undefined>()

// Why: the handler resolves its service via this module accessor, not via ctx —
// mocking it is the cleanest seam without threading a service dep through RpcContext.
vi.mock('../../../system-graph/runtime-system-graph-host', () => ({
  getRuntimeSystemGraphService: vi.fn(() => ({ ensureWatched, getGraph }))
}))

const runSystemGraphWatchStream = vi.hoisted(() => vi.fn(async () => {}))

vi.mock('./system-graph-watch-stream-lifecycle', () => ({ runSystemGraphWatchStream }))

function method(name: string) {
  const found = SYSTEM_GRAPH_METHODS.find((candidate) => candidate.name === name)
  if (!found) {
    throw new Error(`Missing method ${name}`)
  }
  return found
}

describe('system.snapshot RPC method', () => {
  it('ensures the worktree is watched and returns the serialized graph', async () => {
    const graph: EngineSystemGraph = {
      nodes: new Map([
        [
          'n1',
          { id: 'n1', kind: 'endpoint' as const, label: 'GET /health', method: 'GET', diff: null }
        ]
      ]),
      edges: [{ from: 'n1', to: 'n2', kind: 'normal' as const }]
    }
    getGraph.mockReturnValue(graph)
    const runtime = {} as unknown as OrcaRuntimeService
    const snapshot = method('system.snapshot')
    if (isStreamingMethod(snapshot)) {
      throw new Error('system.snapshot must be a request method')
    }

    const result = await snapshot.handler({ worktree: 'repo-1::/repo/app' }, { runtime })

    expect(ensureWatched).toHaveBeenCalledWith('repo-1::/repo/app')
    expect(result).toEqual({ nodes: [...graph.nodes.values()], edges: [...graph.edges] })
  })

  it('falls back to an empty graph when none has been built yet', async () => {
    getGraph.mockReturnValue(undefined)
    const runtime = {} as unknown as OrcaRuntimeService
    const snapshot = method('system.snapshot')
    if (isStreamingMethod(snapshot)) {
      throw new Error('system.snapshot must be a request method')
    }

    const result = await snapshot.handler({ worktree: 'repo-1::/repo/app' }, { runtime })

    expect(result).toEqual({ nodes: [], edges: [] })
  })
})

describe('system.snapshot registration', () => {
  it('is present in ALL_RPC_METHODS', () => {
    expect(ALL_RPC_METHODS.some((candidate) => candidate.name === 'system.snapshot')).toBe(true)
  })
})

describe('system.watch RPC method', () => {
  beforeEach(() => {
    runSystemGraphWatchStream.mockClear()
  })

  it('is registered as a streaming method', () => {
    expect(isStreamingMethod(method('system.watch'))).toBe(true)
  })

  it('builds a unique subscriptionId per connection and sequence', async () => {
    const watch = method('system.watch')
    if (!isStreamingMethod(watch)) {
      throw new Error('system.watch must be a streaming method')
    }
    const runtime = {} as unknown as OrcaRuntimeService
    const emit = vi.fn()

    await watch.handler({ worktree: 'w1' }, { runtime, connectionId: 'conn-a' }, emit)
    await watch.handler({ worktree: 'w1' }, { runtime, connectionId: 'conn-a' }, emit)
    await watch.handler({ worktree: 'w1' }, { runtime, connectionId: 'conn-b' }, emit)

    const ids = runSystemGraphWatchStream.mock.calls.map(
      (call) => (call[0] as { subscriptionId: string }).subscriptionId
    )
    expect(new Set(ids).size).toBe(3)
  })
})

describe('system.unwatch RPC method', () => {
  it('is registered as a request method', () => {
    expect(isStreamingMethod(method('system.unwatch'))).toBe(false)
  })

  it('calls cleanupSubscriptionAndWait and returns {unsubscribed: true}', async () => {
    const unwatch = method('system.unwatch')
    if (isStreamingMethod(unwatch)) {
      throw new Error('system.unwatch must be a request method')
    }
    const cleanupSubscriptionAndWait = vi.fn(async () => {})
    const runtime = { cleanupSubscriptionAndWait } as unknown as OrcaRuntimeService

    const result = await unwatch.handler({ subscriptionId: 'sub-1' }, { runtime })

    expect(cleanupSubscriptionAndWait).toHaveBeenCalledWith('sub-1')
    expect(result).toEqual({ unsubscribed: true })
  })
})

describe('system.watch / system.unwatch registration', () => {
  it('are present in ALL_RPC_METHODS', () => {
    expect(ALL_RPC_METHODS.some((candidate) => candidate.name === 'system.watch')).toBe(true)
    expect(ALL_RPC_METHODS.some((candidate) => candidate.name === 'system.unwatch')).toBe(true)
  })
})
