import { z } from 'zod'
import { defineMethod, type RpcMethod } from '../core'
import { OptionalString } from '../schemas'
import type { QuestionStatus } from '../../orchestration/types'
import { OrchestrationError } from '../../orchestration/orchestration-error'
import { assertLeaseOwnership } from './orchestration-run-scope'

const QuestionListParams = z.object({
  run: z.string().min(1).optional(),
  status: z.enum(['pending', 'answered', 'closed']).optional(),
  // Why: absent for a paired-device lease caller (no terminal); mirrors workerList/gateList.
  from: OptionalString
})

// Why: a read-only inbox mirror of gateList, in its own file — orchestration.ts is
// already max-lines-disabled, so new methods land in a concrete-named sibling instead.
export const ORCHESTRATION_QUESTION_METHODS: RpcMethod[] = [
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
