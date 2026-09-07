import { z } from 'zod'
import { defineMethod, type RpcMethod } from '../core'
import { WorktreeSelector } from './worktree-schemas'
import { AGENT_ACTIVITY_RING_CAPACITY } from '../../../agent-hooks/agent-activity-ring'
import { ensureAgentActivityRecording } from '../../../agent-hooks/agent-activity-recording'

const AgentActivityParams = WorktreeSelector.extend({
  sinceSeq: z.number().int().nonnegative().optional(),
  limit: z.number().int().min(1).max(AGENT_ACTIVITY_RING_CAPACITY).optional()
})

export const AGENT_ACTIVITY_METHODS: RpcMethod[] = [
  defineMethod({
    name: 'agent.activity',
    params: AgentActivityParams,
    handler: async (params) =>
      ensureAgentActivityRecording().read(params.worktree, {
        ...(params.sinceSeq !== undefined ? { sinceSeq: params.sinceSeq } : {}),
        ...(params.limit !== undefined ? { limit: params.limit } : {})
      })
  })
]
