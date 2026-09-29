import { applyAgentPermissionMode } from '../../shared/tui-agent-permissions'
import type { GlobalSettings } from '../../shared/global-settings-types'

export type OrcadAgentPermissions = 'manual' | 'yolo'

export const ORCAD_AGENT_PERMISSIONS: readonly OrcadAgentPermissions[] = ['manual', 'yolo']

type AgentDefaults = Pick<GlobalSettings, 'agentDefaultArgs' | 'agentDefaultEnv'>

export function buildAgentPermissionsPatch(
  mode: OrcadAgentPermissions,
  current: Partial<AgentDefaults>
): Required<AgentDefaults> & { agentYoloDefaultsMigrated: true } {
  return {
    ...applyAgentPermissionMode({
      mode,
      agentDefaultArgs: current.agentDefaultArgs,
      agentDefaultEnv: current.agentDefaultEnv
    }),
    agentYoloDefaultsMigrated: true
  }
}

export function applyOrcadAgentPermissions(
  store: {
    getSettings(): AgentDefaults
    updateSettings(updates: Partial<GlobalSettings>): unknown
  },
  mode: OrcadAgentPermissions
): void {
  store.updateSettings(buildAgentPermissionsPatch(mode, store.getSettings()))
}
