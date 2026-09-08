import { cubeNameFor } from './fan-out-model'
import type { FanOutSlice } from './fan-out-model'

const FANOUT_CHILD_FAILURE_FALLBACK_MESSAGE = 'no se pudo crear el cubo'
const FANOUT_CHILD_FAILURE_SUMMARY_MAX_LENGTH = 160
const FATAL_LINE_PATTERN = /^(fatal|error):/i

/** Reduces a raw (often multi-line git stderr) error to one display line: the LAST
 *  `fatal:`/`error:` line if any (prefix kept as-is), else the first non-empty line, capped at
 *  160 chars with a trailing "…". Empty/whitespace-only input falls back to the generic message. */
export function summarizeChildFailure(message: string): string {
  const lines = message
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
  if (lines.length === 0) return FANOUT_CHILD_FAILURE_FALLBACK_MESSAGE
  const fatalLines = lines.filter((line) => FATAL_LINE_PATTERN.test(line))
  const chosen = fatalLines.length > 0 ? fatalLines[fatalLines.length - 1]! : lines[0]!
  return chosen.length > FANOUT_CHILD_FAILURE_SUMMARY_MAX_LENGTH
    ? `${chosen.slice(0, FANOUT_CHILD_FAILURE_SUMMARY_MAX_LENGTH)}…`
    : chosen
}

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
      // errorMessage stays raw on the slice — only the display row gets summarized.
      message: summarizeChildFailure(entry.errorMessage ?? '')
    }))
}
