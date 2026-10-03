import {
  MIN_FANOUT,
  MAX_FANOUT,
  fanOutCounts,
  fanOutDecisionCounts
} from '../../application/fan-out-model'
import type { FanOutSlice } from '../../application/fan-out-model'
import type { SpawnAgent } from '../../application/ports/runtime-gateway'
import { emptyDecisionVisibility } from '../../application/fan-out-decision-visibility'
import type { WorktreeGraph } from '../../domain/worktree-graph/types'
import { fromParentLabel } from './node-label-model'
import { fanOutBatchFailures } from '../../application/fan-out-batch-failures'
import type { FanOutBatchFailure } from '../../application/fan-out-batch-failures'
import { pendingGatesViewModel, pendingQuestionsViewModel } from './fan-out-decision-view-model'
import type { FanOutGateViewModel, FanOutQuestionViewModel } from './fan-out-decision-view-model'
import { t } from '../../application/i18n/translate'

export type FanOutStepperViewModel = {
  readonly value: number
  readonly min: number
  readonly max: number
  readonly enabled: boolean
}

export type FanOutAgentViewModel = { readonly value: SpawnAgent; readonly enabled: boolean }
export type FanOutFieldViewModel = { readonly value: string; readonly enabled: boolean }

export type FanOutFormViewModel = {
  readonly view: 'form'
  readonly title: string
  readonly count: FanOutStepperViewModel
  readonly agent: FanOutAgentViewModel
  readonly prompt: FanOutFieldViewModel
  readonly submitEnabled: boolean
  readonly errorMessage: string | null
  /** Non-blocking note shown when the target repo has no setup command; null otherwise. */
  readonly setupHint: string | null
}

export type FanOutRunningViewModel = {
  readonly view: 'running'
  readonly callout: string
  readonly counters: string
  readonly gates: readonly FanOutGateViewModel[]
  readonly questions: readonly FanOutQuestionViewModel[]
  readonly failures: readonly FanOutBatchFailure[]
}

export type FanOutViewModel = FanOutFormViewModel | FanOutRunningViewModel | null

/** Mockup line order: working · waiting · spawning · ready · gates · questions, then
 *  an error tail if any failed. Gate/question counts are run-level aggregates (Change C-EXTENDED). */
const countersLine = (slice: Extract<FanOutSlice, { view: 'running' }>): string => {
  const counts = fanOutCounts(slice)
  const decision = fanOutDecisionCounts(slice)
  const base = t('fanout.counters', {
    working: counts.working,
    waiting: counts.waitingInput,
    spawning: counts.naciendo,
    ready: counts.created,
    gates: decision.gateCount,
    questions: decision.questionCount
  })
  return counts.failed > 0
    ? `${base} · ${t('fanout.countersFailedTail', { count: counts.failed })}`
    : base
}

const formTitle = (parentId: string, graph: WorktreeGraph | null): string => {
  const parent = graph?.nodes.get(parentId)
  return parent
    ? t('fanout.title', { parent: fromParentLabel(parent.branch) })
    : t('fanout.titleBare')
}

/**
 * Pure render model for the fan-out form/running HUD (mirrors spawn-view-model.ts). DOM
 * projection lives in fan-out-element.ts; this owns only content and enablement.
 */
export function fanOutViewModel(
  slice: FanOutSlice,
  setupHint: string | null = null,
  graph: WorktreeGraph | null = null
): FanOutViewModel {
  if (slice.view === 'closed') return null

  if (slice.view === 'form') {
    const agentActive = slice.fields.agent !== 'none'
    const countInBounds = slice.fields.count >= MIN_FANOUT && slice.fields.count <= MAX_FANOUT
    return {
      view: 'form',
      title: formTitle(slice.parentId, graph),
      count: { value: slice.fields.count, min: MIN_FANOUT, max: MAX_FANOUT, enabled: true },
      agent: { value: slice.fields.agent, enabled: true },
      prompt: { value: slice.fields.prompt, enabled: agentActive },
      submitEnabled: slice.repoSelector !== null && countInBounds,
      errorMessage: slice.errorMessage ?? null,
      setupHint
    }
  }

  const visibility = slice.decisionVisibility ?? emptyDecisionVisibility()
  return {
    view: 'running',
    callout: t('fanout.callout', { count: slice.fields.count, agent: slice.fields.agent }),
    counters: countersLine(slice),
    gates: pendingGatesViewModel(visibility),
    questions: pendingQuestionsViewModel(visibility),
    failures: fanOutBatchFailures(slice)
  }
}
