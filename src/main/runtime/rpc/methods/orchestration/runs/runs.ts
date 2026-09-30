import { defineMethod } from '../../../core'
import { OrchestrationError } from '../../../../orchestration/orchestration-error'
import {
  assertCallerHandleMatchesEvidence,
  assertLeaseOwnership,
  resolveOrchestrationCaller
} from './run-scope'
import { exposeRun } from './run-receipt'
import type { OrcaRuntimeService } from '../../../../orca-runtime'
import type { OrchestrationCallerIdentity } from '../../../../orchestration/orchestration-caller-identity'
import { currentDispatchAssigneeRun } from '../messaging/recipient-routing'
import {
  RunCreateParams,
  RunCurrentParams,
  RunListParams,
  RunShowParams,
  RunUseParams
} from '../../../../../../shared/rpc-contract/orchestration-runs-params'

function cancelBoundDispatchWaiters(
  runtime: OrcaRuntimeService,
  caller: OrchestrationCallerIdentity,
  runId: string
): void {
  const db = runtime.getOrchestrationDb()
  const dispatch = db.getActiveDispatchForIdentity(caller.address, caller.paneKey ?? undefined)
  if (dispatch && currentDispatchAssigneeRun(runtime, db, dispatch)?.id === runId) {
    runtime.cancelMessageWaiters(`dispatch:${dispatch.id}`)
  }
}

export const ORCHESTRATION_RUN_METHODS = [
  defineMethod({
    name: 'orchestration.runCreate',
    params: RunCreateParams,
    handler: (
      params,
      {
        orchestrationCompatibilityEvidence,
        orchestrationCaller,
        runtime,
        pairedDeviceId,
        clientKind
      }
    ) => {
      // Why: a paired GUI device with no `from` and no terminal evidence is a lease caller —
      // deviceId comes from the authenticated ctx only, never from a user param.
      if (!params.from && !orchestrationCaller && pairedDeviceId && clientKind === 'runtime') {
        const leaseRun = runtime
          .getOrchestrationDb()
          .createLeaseRun({ objective: params.objective, deviceId: pairedDeviceId })
        return {
          run: exposeRun(leaseRun),
          binding: { consumerGeneration: leaseRun.consumer_generation }
        }
      }
      if (!params.from) {
        throw new OrchestrationError('run_required', 'Missing coordinator terminal', {
          effectsApplied: false
        })
      }
      const caller = resolveOrchestrationCaller(runtime, {
        callerTerminalHandle: params.from,
        callerEvidence: orchestrationCompatibilityEvidence,
        callerSession: orchestrationCaller,
        requireStablePane: true
      })
      const db = runtime.getOrchestrationDb()
      const priorRun = db.getCurrentRunForCoordinator(caller)
      const run = db.createRun({
        objective: params.objective,
        coordinatorHandle: caller.terminalHandle,
        coordinatorPaneKey: caller.paneKey,
        coordinatorOrcaSessionId: caller.orcaSessionId
      })
      runtime.cancelMessageWaiters(params.from)
      cancelBoundDispatchWaiters(runtime, caller, run.id)
      if (priorRun) {
        runtime.cancelMessageWaiters(`run:${priorRun.id}`)
      }
      return { run: exposeRun(run) }
    }
  }),
  defineMethod({
    name: 'orchestration.runUse',
    params: RunUseParams,
    handler: (
      params,
      {
        runtime,
        legacyCoordinatorAuthority,
        orchestrationCompatibilityEvidence,
        orchestrationCompatibilityCallerAuthority: callerAuthority,
        orchestrationCaller
      }
    ) => {
      const caller = resolveOrchestrationCaller(runtime, {
        callerTerminalHandle: params.from,
        callerEvidence: orchestrationCompatibilityEvidence,
        callerAuthority,
        callerSession: orchestrationCaller,
        requireStablePane: true,
        evidenceAssertedByCaller: true
      })
      if (
        params.takeoverLegacy &&
        (callerAuthority?.terminalHandle !== params.from ||
          callerAuthority.paneKey !== caller.paneKey)
      ) {
        throw new OrchestrationError(
          'legacy_read_only',
          'Legacy takeover must be invoked by the live coordinator agent terminal it will bind. No effects were applied.',
          { effectsApplied: false }
        )
      }
      assertCallerHandleMatchesEvidence(runtime, params.from, orchestrationCompatibilityEvidence)
      const db = runtime.getOrchestrationDb()
      const priorRun = db.getCurrentRunForCoordinator(caller)
      const run = db.bindRun({
        runId: params.id,
        coordinatorHandle: caller.terminalHandle,
        coordinatorPaneKey: caller.paneKey,
        coordinatorOrcaSessionId: caller.orcaSessionId,
        takeoverLegacy: params.takeoverLegacy,
        legacyCoordinatorAuthority
      })
      if (!run) {
        throw new OrchestrationError(
          'run_not_found',
          `Run ${params.id} was not found or is inspect-only.`
        )
      }
      runtime.cancelMessageWaiters(params.from)
      cancelBoundDispatchWaiters(runtime, caller, run.id)
      runtime.cancelMessageWaiters(`run:${params.id}`)
      if (priorRun && priorRun.id !== params.id) {
        runtime.cancelMessageWaiters(`run:${priorRun.id}`)
      }
      return { run: exposeRun(run) }
    }
  }),
  defineMethod({
    name: 'orchestration.runCurrent',
    params: RunCurrentParams,
    handler: (params, { orchestrationCompatibilityEvidence, orchestrationCaller, runtime }) => {
      const caller = resolveOrchestrationCaller(runtime, {
        callerTerminalHandle: params.from,
        callerEvidence: orchestrationCompatibilityEvidence,
        callerSession: orchestrationCaller,
        requireStablePane: true
      })
      const run = runtime.getOrchestrationDb().getCurrentRunForCoordinator(caller)
      return { run: run ? exposeRun(run) : null }
    }
  }),
  defineMethod({
    name: 'orchestration.runList',
    params: RunListParams,
    handler: (params, { runtime }) => {
      const listed = runtime.getOrchestrationDb().listRuns(params)
      return { ...listed, runs: listed.runs.map(exposeRun) }
    }
  }),
  defineMethod({
    name: 'orchestration.runShow',
    params: RunShowParams,
    handler: (params, { runtime, pairedDeviceId, clientKind }) => {
      const run = runtime.getOrchestrationDb().getRun(params.id)
      if (!run) {
        throw new OrchestrationError('run_not_found', `Run ${params.id} was not found.`)
      }
      // Why: a paired GUI lease caller may only read Runs it owns; a terminal/in-process
      // caller (has `from`, or no paired device) reads unscoped, exactly as before.
      if (!params.from && pairedDeviceId !== undefined && clientKind === 'runtime') {
        assertLeaseOwnership(run, pairedDeviceId)
      }
      return { run: exposeRun(run) }
    }
  })
]
