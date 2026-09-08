import { cubeNameFor } from './fan-out-model'
import type { FanOutSlice } from './fan-out-model'

const FANOUT_CHILD_FAILURE_FALLBACK_MESSAGE = 'no se pudo crear el cubo'

/** One failed camada child for the running panel's failure list. */
export type FanOutBatchFailure = {
  readonly mutationId: string
  readonly label: string
  readonly message: string
}

/** Failed batch entries, in submit order, labeled with the child's generated worktree name. */
export function fanOutBatchFailures(slice: FanOutSlice): readonly FanOutBatchFailure[] {
  if (slice.view !== 'running') return []
  return slice.batch
    .filter((entry) => entry.failed)
    .map((entry) => ({
      mutationId: entry.mutationId,
      label: cubeNameFor(entry.mutationId),
      message: entry.errorMessage ?? FANOUT_CHILD_FAILURE_FALLBACK_MESSAGE
    }))
}
