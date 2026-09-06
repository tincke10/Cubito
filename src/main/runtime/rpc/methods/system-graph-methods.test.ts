import { describe, expect, it, vi } from 'vitest'
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
