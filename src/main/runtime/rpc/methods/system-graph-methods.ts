import { defineMethod, type RpcMethod } from '../core'
import { emptyEngineSystemGraph } from '../../../system-graph/system-graph-model'
import { getRuntimeSystemGraphService } from '../../../system-graph/runtime-system-graph-host'
import { serializeSystemGraph } from '../../../system-graph/system-graph-wire'
import { WorktreeSelector } from './worktree-schemas'

export const SYSTEM_GRAPH_METHODS: RpcMethod[] = [
  defineMethod({
    name: 'system.snapshot',
    params: WorktreeSelector,
    handler: async (params, { runtime }) => {
      const service = getRuntimeSystemGraphService(runtime)
      await service.ensureWatched(params.worktree)
      return serializeSystemGraph(service.getGraph(params.worktree) ?? emptyEngineSystemGraph())
    }
  })
]
