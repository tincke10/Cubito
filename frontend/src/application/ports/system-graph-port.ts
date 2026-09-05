import type { SystemGraph } from '../../domain/system-graph/types'

/** Loads a node's live system graph; v2 adds a subscription for push updates. */
export type SystemGraphPort = {
  loadSystemGraph(nodeId: string): Promise<SystemGraph>
}
