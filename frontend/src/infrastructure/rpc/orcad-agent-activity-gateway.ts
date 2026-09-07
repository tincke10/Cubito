import type {
  AgentActivityEvent,
  AgentActivityPage,
  RuntimeGateway
} from '../../application/ports/runtime-gateway'
import type { RpcCaller } from './orcad-gateway'

export type AgentActivityMethods = Pick<RuntimeGateway, 'agentActivity'>

const AGENT_ACTIVITY_KINDS = ['read', 'edit', 'create', 'run'] as const

/** Projects a raw `agent.activity` event: unknown `kind` or non-numeric `seq`/`at` -> null (row dropped). */
function toAgentActivityEvent(event: {
  seq?: unknown
  at?: unknown
  agent?: unknown
  kind?: unknown
  tool?: unknown
  target?: unknown
}): AgentActivityEvent | null {
  if (typeof event.seq !== 'number' || typeof event.at !== 'number') return null
  if (!(AGENT_ACTIVITY_KINDS as readonly unknown[]).includes(event.kind)) return null
  return {
    seq: event.seq,
    at: event.at,
    kind: event.kind as AgentActivityEvent['kind'],
    tool: typeof event.tool === 'string' ? event.tool : '',
    target: typeof event.target === 'string' ? event.target : '',
    ...(typeof event.agent === 'string' ? { agent: event.agent } : {})
  }
}

/** Projects a raw `agent.activity` result onto the local `AgentActivityPage` shape. */
function toAgentActivityPage(result: { events?: unknown; latestSeq?: unknown }): AgentActivityPage {
  return {
    events: Array.isArray(result.events)
      ? (result.events as Record<string, unknown>[])
          .map(toAgentActivityEvent)
          .filter((event): event is AgentActivityEvent => event !== null)
      : [],
    latestSeq: typeof result.latestSeq === 'number' ? result.latestSeq : 0
  }
}

/**
 * `agent.activity` gateway method, kept out of orcad-gateway.ts (max-lines) as its own module,
 * mirroring orcad-git-merge-gateway.ts's compose-in pattern.
 */
export function createAgentActivityMethods(connection: { call: RpcCaller }): AgentActivityMethods {
  return {
    async agentActivity(input) {
      const response = await connection.call('agent.activity', {
        worktree: input.worktree,
        ...(input.sinceSeq !== undefined ? { sinceSeq: input.sinceSeq } : {}),
        ...(input.limit !== undefined ? { limit: input.limit } : {})
      })
      return toAgentActivityPage(response.result as Parameters<typeof toAgentActivityPage>[0])
    }
  }
}
