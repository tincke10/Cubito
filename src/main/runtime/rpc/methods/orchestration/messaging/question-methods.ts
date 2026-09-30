import { defineMethod } from '../../../core'
import { QuestionListParams } from '../../../../../../shared/rpc-contract/orchestration-question-params'
import type { QuestionStatus } from '../../../../orchestration/types'
import { OrchestrationError } from '../../../../orchestration/orchestration-error'
import { assertLeaseOwnership } from '../runs/run-scope'

// Why: a read-only lease-scoped inbox mirror of gateList.
export const ORCHESTRATION_QUESTION_METHODS = [
  defineMethod({
    name: 'orchestration.questionList',
    params: QuestionListParams,
    handler: (params, { runtime, pairedDeviceId, clientKind }) => {
      const db = runtime.getOrchestrationDb()
      const isLeaseCaller = !params.from && Boolean(pairedDeviceId) && clientKind === 'runtime'
      if (!isLeaseCaller) {
        throw new OrchestrationError(
          'run_required',
          'orchestration.questionList is only reachable via a paired GUI Run lease.',
          { effectsApplied: false }
        )
      }
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
      const questions = db.listQuestionsForRun(leaseRun.id, params.status as QuestionStatus)
      return { runId: leaseRun.id, questions, count: questions.length }
    }
  })
]
