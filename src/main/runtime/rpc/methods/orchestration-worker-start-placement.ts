import { OrchestrationError } from '../../orchestration/orchestration-error'
import type { OrcaRuntimeService } from '../../orca-runtime'
import { assertOrchestrationWorktreeCreationSupported } from './orchestration-folder-worktree-placement'
import type { WorkerStartInput } from './orchestration-worker-start-schema'

export type WorkerStartPlacement = {
  requestedWorktree: string
  createsWorktree: boolean
  creationWorktree: Awaited<ReturnType<OrcaRuntimeService['showManagedWorktree']>> | undefined
  resolvedWorktree:
    | Awaited<ReturnType<OrcaRuntimeService['showManagedTerminalWorkspace']>>
    | undefined
}

/**
 * Resolve where a workerStart call places its worktree. A lease caller (no
 * coordinator terminal) may only name an explicit existing worktree/repo; a
 * terminal caller may additionally reuse 'current' or create a new worktree
 * relative to its own coordinator terminal.
 */
export async function resolveWorkerStartPlacement(args: {
  runtime: OrcaRuntimeService
  params: WorkerStartInput
  isLeaseCaller: boolean
}): Promise<WorkerStartPlacement> {
  const { runtime, params, isLeaseCaller } = args
  const requestedWorktree = params.worktree ?? 'current'
  const createsWorktree = requestedWorktree === 'new-child' || requestedWorktree === 'new-top-level'
  // Why: a lease has no coordinator terminal to seed 'current' or a new worktree from,
  // so it may only target a worktree/repo it names explicitly.
  if (isLeaseCaller && (createsWorktree || requestedWorktree === 'current')) {
    throw new OrchestrationError(
      'invalid_argument',
      'A GUI lease caller must name an explicit existing worktree/repo.'
    )
  }
  if (isLeaseCaller) {
    return {
      requestedWorktree,
      createsWorktree,
      creationWorktree: undefined,
      resolvedWorktree: await runtime.showManagedTerminalWorkspace(requestedWorktree)
    }
  }
  const coordinatorTerminal = await runtime.showTerminal(params.from!)
  const creationWorktree = createsWorktree
    ? await runtime.showManagedWorktree(`id:${coordinatorTerminal.worktreeId}`)
    : undefined
  if (creationWorktree) {
    await assertOrchestrationWorktreeCreationSupported({
      runtime,
      repoSelector: params.repo ?? creationWorktree.repoId,
      existingPlacement: 'current or an exact existing folder workspace'
    })
  }
  const resolvedWorktree = creationWorktree
    ? undefined
    : requestedWorktree === 'current'
      ? await runtime.showManagedTerminalWorkspace(`id:${coordinatorTerminal.worktreeId}`)
      : await runtime.showManagedTerminalWorkspace(requestedWorktree)
  return { requestedWorktree, createsWorktree, creationWorktree, resolvedWorktree }
}
