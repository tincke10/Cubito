import type { LeaseGateRow, LeaseQuestionRow } from '../../application/ports/runtime-gateway'
import type { DecisionVisibility } from '../../application/fan-out-decision-visibility'

export type FanOutGateViewModel = {
  readonly gateId: string
  readonly taskId: string
  readonly question: string
  readonly options: readonly string[]
}

export type FanOutQuestionViewModel = {
  readonly messageId: string
  readonly dispatchId: string
  readonly askerHandle: string
  readonly question?: string
}

/** Parses a gate's JSON-encoded options string; malformed/non-array JSON never throws — an
 *  empty picker beats a crashed panel. */
function parseGateOptions(raw: string): readonly string[] {
  try {
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) && parsed.every((option) => typeof option === 'string')
      ? parsed
      : []
  } catch {
    return []
  }
}

const toGateViewModel = (gate: LeaseGateRow): FanOutGateViewModel => ({
  gateId: gate.id,
  taskId: gate.taskId,
  question: gate.question,
  options: parseGateOptions(gate.options)
})

const toQuestionViewModel = (question: LeaseQuestionRow): FanOutQuestionViewModel => ({
  messageId: question.messageId,
  dispatchId: question.dispatchId,
  askerHandle: question.askerHandle,
  ...(question.question !== undefined ? { question: question.question } : {})
})

/**
 * Projects run-level decision visibility (fan-out-decision-visibility.ts) to the PENDING gates
 * the camada panel's interactive list renders. Split out of fan-out-view-model.ts (design pin
 * 9) to keep that file single-responsibility under the max-lines cap — never a disable.
 */
export function pendingGatesViewModel(
  visibility: DecisionVisibility
): readonly FanOutGateViewModel[] {
  return Object.values(visibility.gatesByTaskId)
    .flat()
    .filter((gate) => gate.status === 'pending')
    .map(toGateViewModel)
}

/** Same PENDING-only projection for question threads. */
export function pendingQuestionsViewModel(
  visibility: DecisionVisibility
): readonly FanOutQuestionViewModel[] {
  return Object.values(visibility.questionsByDispatchId)
    .flat()
    .filter((question) => question.status === 'pending')
    .map(toQuestionViewModel)
}
