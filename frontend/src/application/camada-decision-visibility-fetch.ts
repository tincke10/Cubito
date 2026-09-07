import type { LeaseGateRow, LeaseQuestionRow } from './ports/runtime-gateway'

export type DecisionVisibilityFetchGatewayPort = {
  orchestrationGateList(input: { run: string }): Promise<{ gates: readonly LeaseGateRow[] }>
  orchestrationQuestionList(input: {
    run: string
  }): Promise<{ questions: readonly LeaseQuestionRow[] }>
}

export type DecisionVisibilityFetchResult = {
  gates: readonly LeaseGateRow[] | null
  questions: readonly LeaseQuestionRow[] | null
}

/**
 * One gate/question fetch for a lease Run (Change C-EXTENDED). Each call is independent —
 * a throw on one must not suppress the other — so `null` marks the failed side rather than
 * rejecting the whole fetch. The poll loop must keep ticking regardless of either outcome.
 */
export async function fetchDecisionVisibility(
  gateway: DecisionVisibilityFetchGatewayPort,
  runId: string
): Promise<DecisionVisibilityFetchResult> {
  const [gatesResult, questionsResult] = await Promise.allSettled([
    gateway.orchestrationGateList({ run: runId }),
    gateway.orchestrationQuestionList({ run: runId })
  ])
  return {
    gates: gatesResult.status === 'fulfilled' ? gatesResult.value.gates : null,
    questions: questionsResult.status === 'fulfilled' ? questionsResult.value.questions : null
  }
}
