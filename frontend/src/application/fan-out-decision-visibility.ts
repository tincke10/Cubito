import type { LeaseGateRow, LeaseQuestionRow } from './ports/runtime-gateway'

/** Run-level gate/question visibility (Change C-EXTENDED), grouped by task_id/dispatch_id —
 *  the same keys `FanOutBatchEntry.taskId`/`dispatchId` carry, so a later per-cube indicator
 *  reads off these maps without a breaking change to the slice shape. */
export type DecisionVisibility = {
  gatesByTaskId: Readonly<Record<string, readonly LeaseGateRow[]>>
  questionsByDispatchId: Readonly<Record<string, readonly LeaseQuestionRow[]>>
}

export const emptyDecisionVisibility = (): DecisionVisibility => ({
  gatesByTaskId: {},
  questionsByDispatchId: {}
})

function groupBy<T>(rows: readonly T[], keyOf: (row: T) => string): Record<string, readonly T[]> {
  const grouped: Record<string, T[]> = {}
  for (const row of rows) {
    const key = keyOf(row)
    const bucket = grouped[key]
    if (bucket) bucket.push(row)
    else grouped[key] = [row]
  }
  return grouped
}

/** Replaces `gatesByTaskId` wholesale — each `gates-updated` carries the Run's full current
 *  gate list, not a delta, so stale entries must not linger. */
export function withGates(
  current: DecisionVisibility,
  gates: readonly LeaseGateRow[]
): DecisionVisibility {
  return { ...current, gatesByTaskId: groupBy(gates, (gate) => gate.taskId) }
}

/** Replaces `questionsByDispatchId` wholesale — same full-snapshot contract as `withGates`. */
export function withQuestions(
  current: DecisionVisibility,
  questions: readonly LeaseQuestionRow[]
): DecisionVisibility {
  return {
    ...current,
    questionsByDispatchId: groupBy(questions, (question) => question.dispatchId)
  }
}

const sumBucketSizes = (buckets: Readonly<Record<string, readonly unknown[]>>): number =>
  Object.values(buckets).reduce((sum, rows) => sum + rows.length, 0)

/** Run-level aggregate counts for the HUD counters line. */
export function decisionVisibilityCounts(v: DecisionVisibility): {
  gateCount: number
  questionCount: number
} {
  return {
    gateCount: sumBucketSizes(v.gatesByTaskId),
    questionCount: sumBucketSizes(v.questionsByDispatchId)
  }
}
