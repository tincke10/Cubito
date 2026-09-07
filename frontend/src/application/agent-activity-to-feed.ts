import type { AgentActivityEvent, AgentActivityKind } from './ports/runtime-gateway'
import type { FeedRow } from '../domain/system-graph/types'

const KIND_VERB: Record<AgentActivityKind, string> = {
  read: 'leyó',
  edit: 'editando',
  create: 'nuevo',
  run: 'corrió'
}

const pad = (n: number): string => n.toString().padStart(2, '0')

/** Local HH:MM:SS, zero-padded (design mockup VistaSistema.dc.html:126-135). */
function formatTime(at: number): string {
  const date = new Date(at)
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

/** Maps one `agent.activity` event to a feed row. Pure — mirrors system-snapshot-to-graph.ts. */
export function agentActivityToFeedRow(event: AgentActivityEvent): FeedRow {
  return {
    id: `activity-${event.seq}`,
    time: formatTime(event.at),
    kind: event.kind,
    text: `${KIND_VERB[event.kind]} ${event.target}`
  }
}
