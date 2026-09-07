import { z } from 'zod'
import { defineMethod, defineStreamingMethod, type RpcAnyMethod } from '../core'
import { emptyEngineSystemGraph } from '../../../system-graph/system-graph-model'
import { getRuntimeSystemGraphService } from '../../../system-graph/runtime-system-graph-host'
import { serializeSystemGraph } from '../../../system-graph/system-graph-wire'
import { runSystemGraphWatchStream } from './system-graph-watch-stream-lifecycle'
import { WorktreeSelector } from './worktree-schemas'

let systemWatchSubscriptionSeq = 0

const SystemUnwatch = z.object({
  subscriptionId: z
    .unknown()
    .transform((value) => (typeof value === 'string' && value.length > 0 ? value : ''))
    .pipe(z.string().min(1, 'Missing subscriptionId'))
})

export const SYSTEM_GRAPH_METHODS: RpcAnyMethod[] = [
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
    params: SystemUnwatch,
    handler: async (params, { runtime }) => {
      await runtime.cleanupSubscriptionAndWait(params.subscriptionId)
      return { unsubscribed: true }
    }
  })
]
