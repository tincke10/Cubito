import { AutomationService } from '../automations/service'
import {
  createHeadlessAutomationOutputSnapshotBuffer,
  type HeadlessAutomationDispatcher
} from '../automations/headless-dispatch'
import { buildHeadlessAutomationWorktreeCreateArgs } from '../automations/headless-workspace-create'
import { createRuntimeAutomationRunTerminalObserver } from '../automations/runtime-terminal-run-observer'
import type { Store } from '../persistence'
import type { OrcaRuntimeService } from '../runtime/orca-runtime'

const TERMINAL_SNAPSHOT_LIMIT = 2_000

type AutomationRuntime = Pick<
  OrcaRuntimeService,
  | 'createManagedWorktree'
  | 'launchAgentTerminal'
  | 'showManagedWorktree'
  | 'waitForTerminal'
  | 'readTerminal'
>

// Why a copy of upstream's serve-mode dispatcher: that wiring lives in main-process state
// the fork deleted, and keeping it here leaves upstream syncs conflict-free.
export function createOrcadHeadlessAutomationDispatcher(
  runtime: AutomationRuntime
): HeadlessAutomationDispatcher {
  return async ({ automation, run, target }) => {
    let terminalHandle: string
    let terminalSessionId: string | null = null
    let terminalPaneKey: string | null = null
    let terminalPtyId: string | null = null
    let workspaceId: string
    let workspaceDisplayName: string | null = null
    if (automation.workspaceMode === 'new_per_run') {
      const created = await runtime.createManagedWorktree(
        buildHeadlessAutomationWorktreeCreateArgs({ automation, run, repo: target.repo })
      )
      terminalHandle = created.startupTerminal?.handle ?? ''
      terminalSessionId = created.startupTerminal?.tabId ?? null
      terminalPaneKey = created.startupTerminal?.paneKey ?? null
      terminalPtyId = created.startupTerminal?.ptyId ?? null
      workspaceId = created.worktree.id
      workspaceDisplayName = created.worktree.displayName ?? null
      if (!terminalHandle) {
        throw new Error(
          created.warning || 'Automation workspace was created, but no agent terminal started.'
        )
      }
    } else {
      if (!automation.workspaceId) {
        throw new Error('The target workspace is no longer available.')
      }
      const terminal = await runtime.launchAgentTerminal(`id:${automation.workspaceId}`, {
        agent: automation.agentId,
        prompt: automation.prompt,
        title: run.title
      })
      terminalHandle = terminal.handle
      terminalSessionId = terminal.tabId ?? null
      terminalPaneKey = terminal.paneKey ?? null
      terminalPtyId = terminal.ptyId ?? null
      workspaceId = terminal.worktreeId
      const worktree = await runtime.showManagedWorktree(`id:${workspaceId}`)
      workspaceDisplayName = worktree.displayName ?? null
    }
    const completion = (async () => {
      const wait = await runtime.waitForTerminal(terminalHandle, { condition: 'tui-idle' })
      const read = await runtime.readTerminal(terminalHandle, { limit: TERMINAL_SNAPSHOT_LIMIT })
      const snapshotBuffer = createHeadlessAutomationOutputSnapshotBuffer()
      snapshotBuffer.append(read.tail.join('\n'))
      if (wait.satisfied) {
        return {
          status: 'completed' as const,
          outputSnapshot: snapshotBuffer.snapshot(),
          error: null
        }
      }
      return {
        status: 'dispatch_failed' as const,
        outputSnapshot: snapshotBuffer.snapshot(),
        error: wait.blockedReason
          ? `Automation agent is blocked: ${wait.blockedReason}.`
          : 'Automation agent did not report completion.'
      }
    })()
    return {
      workspaceId,
      workspaceDisplayName,
      terminalSessionId,
      terminalPaneKey,
      terminalPtyId,
      completion
    }
  }
}

/** Builds the runtime-authority scheduler and registers it with the runtime; the caller starts it. */
export function createOrcadAutomationService(
  store: Store,
  runtime: OrcaRuntimeService
): AutomationService {
  // Why no usage stores: they import Electron `app`, and usage capture is optional.
  const service = new AutomationService(store, {
    terminalObserver: createRuntimeAutomationRunTerminalObserver(runtime),
    onAutomationsChanged: (payload) => runtime.notifyAutomationsChanged(payload),
    // Why true: orcad is the server process, the only one that executes remote_host_service schedules.
    allowRemoteHostScheduling: true,
    headlessDispatcher: createOrcadHeadlessAutomationDispatcher(runtime)
  })
  runtime.setAutomationService(service)
  return service
}
