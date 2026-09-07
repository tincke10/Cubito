import type {
  LeaseGateListInput,
  LeaseGateListResult,
  LeaseGateResolveInput,
  LeaseGateResolveResult,
  LeaseGateRow,
  LeaseQuestionAnswerInput,
  LeaseQuestionAnswerResult,
  LeaseQuestionListInput,
  LeaseQuestionListResult,
  LeaseQuestionRow,
  LeaseRunCreateInput,
  LeaseRunCreateResult,
  LeaseTaskCreateInput,
  LeaseTaskCreateResult,
  LeaseWorkerListInput,
  LeaseWorkerListResult,
  LeaseWorkerShowInput,
  LeaseWorkerShowResult,
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
  orchestrationWorkerShow(input: LeaseWorkerShowInput): Promise<LeaseWorkerShowResult>
  orchestrationGateList(input: LeaseGateListInput): Promise<LeaseGateListResult>
  orchestrationGateResolve(input: LeaseGateResolveInput): Promise<LeaseGateResolveResult>
  orchestrationQuestionList(input: LeaseQuestionListInput): Promise<LeaseQuestionListResult>
  orchestrationQuestionAnswer(input: LeaseQuestionAnswerInput): Promise<LeaseQuestionAnswerResult>
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

/** Projects `observation.agentWait`: absent key -> null (never looked), null -> false (looked,
 *  not waiting), present object -> true (waiting on a human). JSON drops `undefined` keys, so an
 *  absent key and an `undefined` value are indistinguishable here — both mean "never looked". */
function toLeaseWorkerShowResult(result: {
  observation?: { agentWait?: unknown }
}): LeaseWorkerShowResult {
  const agentWait = result.observation?.agentWait
  return { awaitingInput: agentWait === undefined ? null : agentWait !== null }
}

/** Projects a raw `orchestration.gateList` row: wire shape is the DB's snake_case DecisionGateRow. */
function toLeaseGateRow(row: {
  id?: unknown
  run_id?: unknown
  task_id?: unknown
  question?: unknown
  options?: unknown
  status?: unknown
  resolution?: unknown
  created_at?: unknown
  resolved_at?: unknown
}): LeaseGateRow {
  return {
    id: typeof row.id === 'string' ? row.id : '',
    runId: typeof row.run_id === 'string' ? row.run_id : '',
    taskId: typeof row.task_id === 'string' ? row.task_id : '',
    question: typeof row.question === 'string' ? row.question : '',
    options: typeof row.options === 'string' ? row.options : '',
    status: typeof row.status === 'string' ? row.status : '',
    resolution: typeof row.resolution === 'string' ? row.resolution : null,
    createdAt: typeof row.created_at === 'string' ? row.created_at : '',
    resolvedAt: typeof row.resolved_at === 'string' ? row.resolved_at : null
  }
}

/** Projects a raw `orchestration.questionList` row: wire shape is the DB's snake_case QuestionRow.
 *  `question` (the prompt text, wave E4) is optional — omitted entirely by an older host. */
function toLeaseQuestionRow(row: {
  message_id?: unknown
  run_id?: unknown
  dispatch_id?: unknown
  asker_handle?: unknown
  status?: unknown
  answer_message_id?: unknown
  answer_body?: unknown
  answered_by_generation?: unknown
  created_at?: unknown
  answered_at?: unknown
  closed_at?: unknown
  question?: unknown
}): LeaseQuestionRow {
  return {
    messageId: typeof row.message_id === 'string' ? row.message_id : '',
    runId: typeof row.run_id === 'string' ? row.run_id : '',
    dispatchId: typeof row.dispatch_id === 'string' ? row.dispatch_id : '',
    askerHandle: typeof row.asker_handle === 'string' ? row.asker_handle : '',
    status: typeof row.status === 'string' ? row.status : '',
    answerMessageId: typeof row.answer_message_id === 'string' ? row.answer_message_id : null,
    answerBody: typeof row.answer_body === 'string' ? row.answer_body : null,
    answeredByGeneration:
      typeof row.answered_by_generation === 'number' ? row.answered_by_generation : null,
    createdAt: typeof row.created_at === 'string' ? row.created_at : '',
    answeredAt: typeof row.answered_at === 'string' ? row.answered_at : null,
    closedAt: typeof row.closed_at === 'string' ? row.closed_at : null,
    ...(typeof row.question === 'string' ? { question: row.question } : {})
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
    },
    async orchestrationWorkerShow(input) {
      const response = await connection.call('orchestration.workerShow', {
        dispatch: input.dispatch
      })
      return toLeaseWorkerShowResult(
        response.result as Parameters<typeof toLeaseWorkerShowResult>[0]
      )
    },
    async orchestrationGateList(input) {
      const response = await connection.call('orchestration.gateList', { run: input.run })
      const result = response.result as { gates?: unknown }
      if (!Array.isArray(result?.gates)) {
        throw new Error('orchestration.gateList returned no gates array')
      }
      return { gates: (result.gates as Record<string, unknown>[]).map(toLeaseGateRow) }
    },
    async orchestrationGateResolve(input) {
      const response = await connection.call('orchestration.gateResolve', {
        run: input.run,
        id: input.gateId,
        resolution: input.resolution
      })
      const result = response.result as { gate?: unknown }
      if (typeof result?.gate !== 'object' || result.gate === null) {
        throw new Error('orchestration.gateResolve returned no gate')
      }
      return { gate: toLeaseGateRow(result.gate as Record<string, unknown>) }
    },
    async orchestrationQuestionList(input) {
      const response = await connection.call('orchestration.questionList', { run: input.run })
      const result = response.result as { questions?: unknown }
      if (!Array.isArray(result?.questions)) {
        throw new Error('orchestration.questionList returned no questions array')
      }
      return { questions: (result.questions as Record<string, unknown>[]).map(toLeaseQuestionRow) }
    },
    async orchestrationQuestionAnswer(input) {
      const response = await connection.call('orchestration.reply', {
        run: input.run,
        id: input.messageId,
        body: input.body
      })
      const result = response.result as { message?: { id?: unknown }; duplicate?: unknown }
      const messageId = result?.message?.id
      if (typeof messageId !== 'string') {
        throw new Error('orchestration.reply returned no message id')
      }
      return { messageId, duplicate: result.duplicate === true }
    }
  }
}
