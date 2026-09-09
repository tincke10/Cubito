import { ipcMain } from 'electron'
import type { AgentTrustPreset } from '../agent-trust-presets'
import { markAgentWorkspaceTrusted } from '../agent-workspace-trust'

/**
 * Why: cursor-agent, GitHub Copilot CLI, and Codex gate first-launch in an
 * unfamiliar directory behind a "Do you trust this folder?" menu that consumes
 * keystrokes (numbered options / single-letter shortcuts). Orca's draft-URL
 * paste flow needs the input box, not the menu, so before Orca spawns the
 * agent it asks main to write the same trust artifacts the agents write
 * after the user accepts. Routes through the shared dispatcher, which
 * swallows write errors so a failed trust write never blocks the workspace.
 */
export function registerAgentTrustHandlers(): void {
  ipcMain.removeHandler('agentTrust:markTrusted')
  ipcMain.handle(
    'agentTrust:markTrusted',
    async (
      _event,
      args: { preset: AgentTrustPreset; workspacePath: string; connectionId?: string }
    ): Promise<void> => {
      if (!args || typeof args.workspacePath !== 'string' || !args.workspacePath) {
        return
      }
      const connectionId = typeof args.connectionId === 'string' ? args.connectionId.trim() : ''
      await markAgentWorkspaceTrusted({
        preset: args.preset,
        workspacePath: args.workspacePath,
        host: connectionId ? { kind: 'remote', connectionId } : { kind: 'local' }
      })
    }
  )
}
