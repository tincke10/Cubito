import type { OrchestrationCompatibilityEvidence } from '../../../../shared/orchestration-compatibility-evidence'
import { OrchestrationError } from '../../orchestration/orchestration-error'
import type { OrchestrationDb } from '../../orchestration/db'
import type { RunRow } from '../../orchestration/types'
import type { OrcaRuntimeService } from '../../orca-runtime'
import { assertLeaseOwnership, resolveOrchestrationCaller } from './orchestration-run-scope'
import type { WorkerStartInput } from './orchestration-worker-start-schema'

export type WorkerStartRunBinding = { run: RunRow; isLeaseCaller: boolean }

/**
 * Resolve the Run a workerStart call is bound to. A paired-GUI lease caller (no
 * terminal) binds by explicit --run + device ownership; a terminal caller binds
 * by the coordinator pane currently bound to a Run, as before.
 */
export function resolveWorkerStartRunBinding(args: {
  db: OrchestrationDb
  runtime: OrcaRuntimeService
  params: WorkerStartInput
  orchestrationCompatibilityEvidence?: OrchestrationCompatibilityEvidence
  pairedDeviceId?: string
  clientKind?: 'mobile' | 'runtime'
}): WorkerStartRunBinding {
  const { db, runtime, params, orchestrationCompatibilityEvidence, pairedDeviceId, clientKind } =
    args
  // Why: a GUI lease caller has no terminal — the paired-device identity comes
  // only from the authenticated ctx, never a user param, and never both at once.
  const isLeaseCaller = !params.from && Boolean(pairedDeviceId) && clientKind === 'runtime'
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
    assertLeaseOwnership(leaseRun, pairedDeviceId!)
    return { run: leaseRun, isLeaseCaller: true }
  }
  if (!params.from) {
    throw new OrchestrationError('run_required', 'Missing coordinator terminal', {
      effectsApplied: false
    })
  }
  // Why: worker-start was the only Run-scoped verb that skipped this, so a
  // declared --from could name someone else's pane and inherit their depth.
  const coordinatorPane = resolveOrchestrationCaller(runtime, {
    callerTerminalHandle: params.from,
    callerEvidence: orchestrationCompatibilityEvidence
  })
  const currentRun = coordinatorPane ? db.getCurrentRunForPane(coordinatorPane) : undefined
  if (!currentRun || (params.run && params.run !== currentRun.id)) {
    throw new OrchestrationError(
      'consumer_fenced',
      'worker-start requires the coordinator terminal currently bound to the Task Run.'
    )
  }
  return { run: currentRun, isLeaseCaller: false }
}
