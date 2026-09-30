import type { OrchestrationDb } from '../../../../orchestration/db'
import type { DispatchContextRow } from '../../../../orchestration/types'
import { OrchestrationError } from '../../../../orchestration/orchestration-error'
import { assertLeaseOwnership } from '../runs/run-scope'

/**
 * Resolve the Dispatch a workerShow call targets, and — for a paired GUI lease caller
 * (no `from`, no coordinator terminal) — assert it may only see a Dispatch whose Run it
 * owns. workerShow has no --run param, so ownership is resolved via dispatch.run_id.
 * Terminal/in-process callers (has `from`, or no paired device) are unscoped, as before.
 */
export function resolveWorkerShowDispatch(args: {
  db: OrchestrationDb
  dispatchId: string
  from?: string
  pairedDeviceId?: string
  clientKind?: 'mobile' | 'runtime'
}): DispatchContextRow {
  const dispatch = args.db.getDispatchContextById(args.dispatchId)
  if (!dispatch) {
    throw new OrchestrationError(
      'dispatch_not_found',
      `Worker Dispatch ${args.dispatchId} was not found.`
    )
  }
  const isLeaseCaller = !args.from && Boolean(args.pairedDeviceId) && args.clientKind === 'runtime'
  if (isLeaseCaller) {
    const run = args.db.getRun(dispatch.run_id)
    if (!run) {
      throw new OrchestrationError('run_not_found', `Run ${dispatch.run_id} was not found.`)
    }
    assertLeaseOwnership(run, args.pairedDeviceId!)
  }
  return dispatch
}

/** A paired GUI lease caller must name a Run it owns; there is no coordinator terminal to infer it. */
export function assertLeaseRunOwnedForList(
  db: OrchestrationDb,
  runId: string | undefined,
  deviceId: string
): void {
  if (!runId) {
    throw new OrchestrationError(
      'run_required',
      'A GUI lease caller must provide --run; there is no coordinator terminal to infer it from.',
      { effectsApplied: false }
    )
  }
  const run = db.getRun(runId)
  if (!run) {
    throw new OrchestrationError('run_not_found', `Run ${runId} was not found.`)
  }
  assertLeaseOwnership(run, deviceId)
}
