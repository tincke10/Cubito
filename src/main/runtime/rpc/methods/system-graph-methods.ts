import { defineMethod, defineStreamingMethod } from '../core'
import { emptyEngineSystemGraph } from '../../../system-graph/system-graph-model'
import { getRuntimeSystemGraphService } from '../../../system-graph/runtime-system-graph-host'
import { serializeSystemGraph } from '../../../system-graph/system-graph-wire'
import { runSystemGraphWatchStream } from './system-graph-watch-stream-lifecycle'
import { WorktreeSelector } from '../../../../shared/rpc-contract/git-params'
import { SystemUnwatchParams } from '../../../../shared/rpc-contract/system-graph-params'

let systemWatchSubscriptionSeq = 0

export const SYSTEM_GRAPH_METHODS = [
  defineMethod({
    name: 'system.snapshot',
    params: WorktreeSelector,
    handler: async (params, { runtime }) => {
      const service = getRuntimeSystemGraphService(runtime)
      await service.ensureWatched(params.worktree)
      return serializeSystemGraph(service.getGraph(params.worktree) ?? emptyEngineSystemGraph())
    }
  }),
  defineStreamingMethod({
    name: 'system.watch',
    params: WorktreeSelector,
    handler: async (params, { runtime, connectionId, signal }, emit) => {
      const subscriptionId = `system-watch-${connectionId ?? 'inproc'}-${++systemWatchSubscriptionSeq}`
      await runSystemGraphWatchStream({
        runtime,
        worktree: params.worktree,
        connectionId,
        signal,
        subscriptionId,
        emit
      })
    }
  }),
  defineMethod({
    name: 'system.unwatch',
    params: SystemUnwatchParams,
    handler: async (params, { runtime }) => {
      await runtime.cleanupSubscriptionAndWait(params.subscriptionId)
      return { unsubscribed: true }
    }
  })
]
