import type { OrchestrationCompatibilityEvidence } from '../../../../../../shared/orchestration-compatibility-evidence'
import { OrchestrationError } from '../../../../orchestration/orchestration-error'
import type { OrchestrationDb } from '../../../../orchestration/db'
import type { RunRow } from '../../../../orchestration/types'
import type {
  OrchestrationCallerIdentity,
  OrchestrationSessionCaller
} from '../../../../orchestration/orchestration-caller-identity'
import type { OrcaRuntimeService } from '../../../../orca-runtime'
import { assertLeaseOwnership, resolveOrchestrationCaller } from '../runs/run-scope'
import type { WorkerStartInput } from './worker-start-schema'

export type WorkerStartRunBinding = {
  run: RunRow
  coordinator: OrchestrationCallerIdentity | null
  /** Set only for a paired-GUI lease caller; the authenticated device that owns the Run. */
  leaseDeviceId: string | undefined
}

/**
 * Resolve the Run a workerStart call is bound to. A paired-GUI lease caller (no
 * terminal) binds by explicit --run + device ownership; a terminal or session caller
 * binds by the coordinator currently bound to a Run, as before.
 */
export function resolveWorkerStartRunBinding(args: {
  db: OrchestrationDb
  runtime: OrcaRuntimeService
  params: WorkerStartInput
  orchestrationCompatibilityEvidence?: OrchestrationCompatibilityEvidence
  orchestrationCaller?: OrchestrationSessionCaller
  pairedDeviceId?: string
  clientKind?: 'mobile' | 'runtime'
}): WorkerStartRunBinding {
  const { db, runtime, params, pairedDeviceId } = args
  // Why: a GUI lease caller has no terminal — the paired-device identity comes
  // only from the authenticated ctx, never a user param, and never both at once.
  const isLeaseCaller =
    !params.from &&
    !args.orchestrationCaller &&
    pairedDeviceId !== undefined &&
    args.clientKind === 'runtime'
  if (isLeaseCaller) {
    // Why: a lease has no pane to derive a Run from, so the caller must name it,
    // and device ownership (not pane identity) is the entire trust boundary.
    if (!params.run) {
      throw new OrchestrationError(
        'run_required',
        'A GUI lease caller must provide --run; there is no coordinator terminal to infer it from.',
        { effectsApplied: false }
      )
    }
    const leaseRun = db.getRun(params.run)
    if (!leaseRun) {
      throw new OrchestrationError('run_not_found', `Run ${params.run} was not found.`)
    }
    assertLeaseOwnership(leaseRun, pairedDeviceId)
    return { run: leaseRun, coordinator: null, leaseDeviceId: pairedDeviceId }
  }
  if (!params.from) {
    throw new OrchestrationError('run_required', 'Missing coordinator terminal', {
      effectsApplied: false
    })
  }
  const coordinator = resolveOrchestrationCaller(runtime, {
    callerTerminalHandle: params.from,
    callerEvidence: args.orchestrationCompatibilityEvidence,
    callerSession: args.orchestrationCaller
  })
  const run = coordinator ? db.getCurrentRunForCoordinator(coordinator) : undefined
  if (!run || (params.run && params.run !== run.id)) {
    throw new OrchestrationError(
      'consumer_fenced',
      'worker-start requires the coordinator terminal currently bound to the Task Run.'
    )
  }
  return { run, coordinator, leaseDeviceId: undefined }
}
