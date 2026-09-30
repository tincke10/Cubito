import { OrchestrationError } from '../../../../orchestration/orchestration-error'
import type { OrcaRuntimeService } from '../../../../orca-runtime'

/**
 * Where a paired-GUI lease caller's worker runs. A lease has no coordinator terminal,
 * so it may only name an explicit existing worktree/repo — never 'current' or a new one.
 */
export async function resolveLeaseWorkerPlacement(
  runtime: OrcaRuntimeService,
  requestedWorktree: string
): Promise<Awaited<ReturnType<OrcaRuntimeService['showManagedTerminalWorkspace']>>> {
  if (
    requestedWorktree === 'current' ||
    requestedWorktree === 'new-child' ||
    requestedWorktree === 'new-top-level'
  ) {
    throw new OrchestrationError(
      'invalid_argument',
      'A GUI lease caller must name an explicit existing worktree/repo.'
    )
  }
  return runtime.showManagedTerminalWorkspace(requestedWorktree)
}
