import {
  type AgentTrustPreset,
  markClaudeWorkspaceTrusted,
  markCodexProjectTrusted,
  markCopilotFolderTrusted,
  markCursorWorkspaceTrusted
} from './agent-trust-presets'
import { markRemoteAgentWorkspaceTrusted } from './remote-agent-trust-presets'
import { ClaudeRuntimePathResolver } from './claude-accounts/runtime-paths'

export type AgentWorkspaceTrustHost = { kind: 'local' } | { kind: 'remote'; connectionId: string }

/**
 * Single dispatch point for pre-marking a workspace trusted for a TUI agent,
 * shared by every call site instead of a duplicated preset switch each.
 */
export async function markAgentWorkspaceTrusted(args: {
  preset: AgentTrustPreset | undefined
  workspacePath: string
  host: AgentWorkspaceTrustHost
  claudeConfigDir?: string
  codexHome?: string
}): Promise<void> {
  if (!args.preset) {
    return
  }
  try {
    if (args.host.kind === 'remote') {
      await markRemoteAgentWorkspaceTrusted({
        preset: args.preset,
        connectionId: args.host.connectionId,
        workspacePath: args.workspacePath,
        ...(args.claudeConfigDir ? { claudeConfigDir: args.claudeConfigDir } : {}),
        ...(args.codexHome ? { codexHome: args.codexHome } : {})
      })
      return
    }
    switch (args.preset) {
      case 'cursor':
        markCursorWorkspaceTrusted(args.workspacePath)
        return
      case 'copilot':
        markCopilotFolderTrusted(args.workspacePath)
        return
      case 'codex':
        // Why: the Codex write queues behind any in-flight hook grant, so the agent must not
        // launch until it has actually landed.
        await markCodexProjectTrusted(args.workspacePath, args.codexHome)
        return
      case 'claude':
        if (args.claudeConfigDir) {
          markClaudeWorkspaceTrusted(
            args.workspacePath,
            new ClaudeRuntimePathResolver().getRuntimePaths(args.claudeConfigDir).configPath
          )
        } else {
          markClaudeWorkspaceTrusted(args.workspacePath)
        }
    }
  } catch {
    // Why: best-effort — user can still accept the trust prompt manually.
  }
}
