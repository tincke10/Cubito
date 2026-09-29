import type { AgentHookServer } from '../agent-hooks/server'
import type { OrcaRuntimeService } from '../runtime/orca-runtime'

type RuntimeDeps = NonNullable<ConstructorParameters<typeof OrcaRuntimeService>[2]>

type AgentStatusRuntimeDeps = Pick<
  RuntimeDeps,
  | 'onTerminalAgentStatus'
  | 'getAgentStatusSnapshot'
  | 'getAgentProviderSessionSnapshot'
  | 'getAgentProviderSessionRowsForPane'
  | 'attestAgentHookCompatibilityAuthority'
  | 'retireAgentHookCompatibilityAuthority'
  | 'reconcileAgentStatusForEndedProcess'
>

// Why: the deleted Electron main handed the runtime these hook-server readers; without
// them worktree.ps and session.tabs see no hook status on a headless host.
export function createOrcadAgentStatusDeps(server: AgentHookServer): AgentStatusRuntimeDeps {
  return {
    onTerminalAgentStatus: (event) => server.ingestTerminalStatus(event),
    getAgentStatusSnapshot: () =>
      server.getStatusSnapshot().filter((entry) => entry.providerSessionOnly !== true),
    // Why unfiltered: resume-identity-only rows carry the provider session mobile chat needs.
    getAgentProviderSessionSnapshot: () => server.getStatusSnapshot(),
    getAgentProviderSessionRowsForPane: (paneKey) => server.getStatusSnapshotForPane(paneKey),
    attestAgentHookCompatibilityAuthority: (candidate) =>
      server.attestCompatibilityAuthority(candidate),
    retireAgentHookCompatibilityAuthority: (paneKey) => server.retirePaneAuthority(paneKey),
    reconcileAgentStatusForEndedProcess: (paneKeys) => {
      server.reconcileEndedProcessForPaneKeys(paneKeys)
    }
  }
}
