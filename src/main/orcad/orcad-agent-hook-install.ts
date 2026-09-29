import type { AgentHookInstallStatus } from '../../shared/agent-hook-types'
import {
  installManagedAgentHooks,
  isAgentStatusHooksEnabled
} from '../agent-hooks/managed-agent-hook-controls'
import type { GlobalSettings } from '../../shared/global-settings-types'

type HookInstallSettings = Partial<
  Pick<GlobalSettings, 'agentCmdOverrides' | 'agentStatusHooksEnabled' | 'disabledTuiAgents'>
>

// Why: the desktop app installed these at startup; headless has no such path, so agents never
// report status to the hook receiver. Skip (never remove) when off: hook files are user-global.
export async function installOrcadAgentHooks(
  settings: HookInstallSettings
): Promise<AgentHookInstallStatus[]> {
  if (!isAgentStatusHooksEnabled(settings)) {
    return []
  }
  try {
    return await installManagedAgentHooks(settings)
  } catch (error) {
    console.warn('[orcad] failed to install agent status hooks:', error)
    return []
  }
}
