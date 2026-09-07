import { applySystemGraphDelta } from '../domain/system-graph/apply-system-graph-delta'
import { emptySystemGraph } from '../domain/system-graph/types'
import type {
  FeedRow,
  SystemGraph,
  SystemGraphDelta,
  SystemNodeId
} from '../domain/system-graph/types'

/** closed → open (anchored to a node, graph + feed fill in via apply-delta/append-feed). */
export type SystemViewSlice =
  | { view: 'closed' }
  | {
      view: 'open'
      focusedNodeId: SystemNodeId
      graph: SystemGraph
      feed: readonly FeedRow[]
      highlightedNodeId?: SystemNodeId
    }

export const emptySystemViewSlice = (): SystemViewSlice => ({ view: 'closed' })

/** Feed ring cap (design): oldest rows drop once a batch pushes past this count. */
export const SYSTEM_FEED_MAX_ROWS = 50

export type SystemViewAction =
  | { type: 'open'; nodeId: SystemNodeId }
  | { type: 'close' }
  | { type: 'apply-delta'; delta: SystemGraphDelta }
  | { type: 'replace-graph'; graph: SystemGraph }
  | { type: 'append-feed'; row: FeedRow }
  | { type: 'append-feed-rows'; rows: readonly FeedRow[] }
  | { type: 'reset-feed' }
  | { type: 'set-highlight'; nodeId: SystemNodeId | null }

/** Appends rows and caps to the newest SYSTEM_FEED_MAX_ROWS. */
function appendFeedRows(feed: readonly FeedRow[], rows: readonly FeedRow[]): readonly FeedRow[] {
  const merged = [...feed, ...rows]
  return merged.length > SYSTEM_FEED_MAX_ROWS
    ? merged.slice(merged.length - SYSTEM_FEED_MAX_ROWS)
    : merged
}

export function reduceSystemView(
  slice: SystemViewSlice,
  action: SystemViewAction
): SystemViewSlice {
  switch (action.type) {
    case 'open':
      return { view: 'open', focusedNodeId: action.nodeId, graph: emptySystemGraph(), feed: [] }
    case 'close':
      return { view: 'closed' }
    case 'apply-delta':
      return slice.view === 'open'
        ? { ...slice, graph: applySystemGraphDelta(slice.graph, action.delta) }
        : slice
    case 'replace-graph':
      return slice.view === 'open' ? { ...slice, graph: action.graph } : slice
    case 'append-feed':
      return slice.view === 'open'
        ? { ...slice, feed: appendFeedRows(slice.feed, [action.row]) }
        : slice
    case 'append-feed-rows':
      return slice.view === 'open'
        ? { ...slice, feed: appendFeedRows(slice.feed, action.rows) }
        : slice
    case 'reset-feed':
      return slice.view === 'open' ? { ...slice, feed: [] } : slice
    case 'set-highlight':
      return slice.view === 'open' ? withHighlight(slice, action.nodeId) : slice
    default:
      return slice
  }
}

function withHighlight(
  slice: Extract<SystemViewSlice, { view: 'open' }>,
  nodeId: SystemNodeId | null
): SystemViewSlice {
  if (nodeId === null) {
    const { highlightedNodeId: _drop, ...rest } = slice
    return rest
  }
  return { ...slice, highlightedNodeId: nodeId }
}

export type SystemHudCounts = { tocados: number; nuevo: number }

const emptySystemHudCounts = (): SystemHudCounts => ({ tocados: 0, nuevo: 0 })

/** HUD copy: "N endpoints tocados · M nuevo" — editing/dirty endpoints vs naciendo endpoints. */
export function systemHudCounts(slice: SystemViewSlice): SystemHudCounts {
  if (slice.view !== 'open') return emptySystemHudCounts()
  const counts = emptySystemHudCounts()
  for (const node of slice.graph.nodes.values()) {
    if (node.kind !== 'endpoint') continue
    if (node.state === 'editing' || node.state === 'dirty') counts.tocados += 1
    else if (node.state === 'naciendo') counts.nuevo += 1
  }
  return counts
}
