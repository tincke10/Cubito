import { emptyEngineSystemGraph, type EngineSystemGraph } from './system-graph-model'
import { getSystemGraphService, type SystemGraphHost } from './system-graph-service'

export function getSystemGraph(runtime: SystemGraphHost, worktreeId: string): EngineSystemGraph {
  return getSystemGraphService(runtime).getGraph(worktreeId) ?? emptyEngineSystemGraph()
}
