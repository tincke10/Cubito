import { agentHookServer } from './server'
import { createAgentActivityRecorder, type AgentActivityRecorder } from './agent-activity-recorder'

let recorder: AgentActivityRecorder | undefined

/** Lazy idempotent singleton — the eager orcad-entry.ts arm and the agent.activity RPC
 *  handler share one ring/subscription; the only file importing agentHookServer for this feed. */
export function ensureAgentActivityRecording(): AgentActivityRecorder {
  if (!recorder) {
    const created = createAgentActivityRecorder()
    agentHookServer.subscribeEnrichedStatus((event) => created.observe(event))
    recorder = created
  }
  return recorder
}
