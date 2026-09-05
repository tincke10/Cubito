import { MIN_FANOUT, MAX_FANOUT, fanOutCounts } from '../../application/fan-out-model'
import type { FanOutSlice } from '../../application/fan-out-model'
import type { SpawnAgent } from '../../application/ports/runtime-gateway'

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
  readonly count: FanOutStepperViewModel
  readonly agent: FanOutAgentViewModel
  readonly prompt: FanOutFieldViewModel
  readonly submitEnabled: boolean
  readonly errorMessage: string | null
}

export type FanOutRunningViewModel = {
  readonly view: 'running'
  readonly callout: string
  readonly counters: string
}

export type FanOutViewModel = FanOutFormViewModel | FanOutRunningViewModel | null

/** Mockup line order: trabajando · esperando · naciendo · listo, then an error tail if any failed. */
const countersLine = (slice: Extract<FanOutSlice, { view: 'running' }>): string => {
  const counts = fanOutCounts(slice)
  const base = `${counts.working} trabajando · ${counts.waitingInput} esperando · ${counts.naciendo} naciendo · ${counts.created} listo`
  return counts.failed > 0 ? `${base} · ${counts.failed} error` : base
}

/**
 * Pure render model for the fan-out form/running HUD (mirrors spawn-view-model.ts). DOM
 * projection lives in fan-out-element.ts; this owns only content and enablement.
 */
export function fanOutViewModel(slice: FanOutSlice): FanOutViewModel {
  if (slice.view === 'closed') return null

  if (slice.view === 'form') {
    const agentActive = slice.fields.agent !== 'none'
    const countInBounds = slice.fields.count >= MIN_FANOUT && slice.fields.count <= MAX_FANOUT
    return {
      view: 'form',
      count: { value: slice.fields.count, min: MIN_FANOUT, max: MAX_FANOUT, enabled: true },
      agent: { value: slice.fields.agent, enabled: true },
      prompt: { value: slice.fields.prompt, enabled: agentActive },
      submitEnabled: slice.repoSelector !== null && countInBounds,
      errorMessage: slice.errorMessage ?? null
    }
  }

  return {
    view: 'running',
    callout: `fan-out · ${slice.fields.count} × ${slice.fields.agent}`,
    counters: countersLine(slice)
  }
}
