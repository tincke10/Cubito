import type {
  LeaseRunCreateInput,
  LeaseRunCreateResult,
  LeaseTaskCreateInput,
  LeaseTaskCreateResult,
  LeaseWorkerListInput,
  LeaseWorkerListResult,
  LeaseWorkerStartInput,
  LeaseWorkerStartResult,
  WorkerDispatchStateRow
} from '../../application/ports/runtime-gateway'
import type { RpcCaller } from './orcad-gateway'

export type OrchestrationLeaseMethods = {
  orchestrationRunCreate(input: LeaseRunCreateInput): Promise<LeaseRunCreateResult>
  orchestrationTaskCreate(input: LeaseTaskCreateInput): Promise<LeaseTaskCreateResult>
  orchestrationWorkerStart(input: LeaseWorkerStartInput): Promise<LeaseWorkerStartResult>
  orchestrationWorkerList(input: LeaseWorkerListInput): Promise<LeaseWorkerListResult>
}

/** Projects a raw `orchestration.workerList` row: `worktreeId` is nested+nullable under `resource`. */
function toWorkerDispatchStateRow(row: {
  dispatchId?: unknown
  workerState?: unknown
  dispatchStatus?: unknown
  resource?: { worktreeId?: unknown } | null
}): WorkerDispatchStateRow {
  return {
    dispatchId: typeof row.dispatchId === 'string' ? row.dispatchId : '',
    workerState: typeof row.workerState === 'string' ? row.workerState : '',
    dispatchStatus: typeof row.dispatchStatus === 'string' ? row.dispatchStatus : '',
    worktreeId:
      row.resource && typeof row.resource.worktreeId === 'string' ? row.resource.worktreeId : null
  }
}

/**
 * The 3 orchestration lease verbs (Change B): every call omits `from`/`callerTerminalHandle`,
 * so the transport's already-stamped pairedDeviceId + clientKind:'runtime' routes the engine
 * to its lease-caller branch (see orchestration-run-scope.ts on the engine side).
 */
export function createOrchestrationLeaseMethods(connection: {
  call: RpcCaller
}): OrchestrationLeaseMethods {
  return {
    async orchestrationRunCreate(input) {
      const response = await connection.call('orchestration.runCreate', {
        objective: input.objective
      })
      const result = response.result as { run?: { id?: unknown } }
      const runId = result?.run?.id
      if (typeof runId !== 'string') {
        throw new Error('orchestration.runCreate returned no run id')
      }
      return { runId }
    },
    async orchestrationTaskCreate(input) {
      const response = await connection.call('orchestration.taskCreate', {
        spec: input.spec,
        run: input.run,
        ...(input.taskTitle !== undefined ? { taskTitle: input.taskTitle } : {}),
        ...(input.displayName !== undefined ? { displayName: input.displayName } : {}),
        ...(input.deps !== undefined ? { deps: JSON.stringify(input.deps) } : {})
      })
      const result = response.result as { task?: { id?: unknown } }
      const taskId = result?.task?.id
      if (typeof taskId !== 'string') {
        throw new Error('orchestration.taskCreate returned no task id')
      }
      return { taskId }
    },
    async orchestrationWorkerStart(input) {
      const response = await connection.call('orchestration.workerStart', {
        task: input.task,
        run: input.run,
        worktree: input.worktree,
        ...(input.agent !== undefined ? { agent: input.agent } : {}),
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.displayName !== undefined ? { displayName: input.displayName } : {})
      })
      const result = response.result as {
        dispatchId?: unknown
        runId?: unknown
        taskId?: unknown
        state?: unknown
        stage?: unknown
      }
      if (
        typeof result?.dispatchId !== 'string' ||
        typeof result.runId !== 'string' ||
        typeof result.taskId !== 'string' ||
        typeof result.state !== 'string' ||
        typeof result.stage !== 'string'
      ) {
        throw new Error('orchestration.workerStart returned an incomplete result')
      }
      return {
        dispatchId: result.dispatchId,
        runId: result.runId,
        taskId: result.taskId,
        state: result.state,
        stage: result.stage
      }
    },
    async orchestrationWorkerList(input) {
      const response = await connection.call('orchestration.workerList', {
        run: input.run,
        ...(input.terminalState !== undefined ? { terminalState: input.terminalState } : {})
      })
      const result = response.result as { workers?: unknown }
      if (!Array.isArray(result?.workers)) {
        throw new Error('orchestration.workerList returned no workers array')
      }
      return {
        workers: (result.workers as Record<string, unknown>[]).map(toWorkerDispatchStateRow)
      }
    }
  }
}
