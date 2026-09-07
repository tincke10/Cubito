import { buildSystemGraph } from '../domain/system-graph/build-system-graph'
import type {
  SystemGraph,
  SystemNode,
  SystemNodeId,
  SystemNodeState
} from '../domain/system-graph/types'
import type { GitStatusRow } from './ports/runtime-gateway'

const ROUTER_PREFIX = 'router:'
const ENDPOINT_PREFIX = 'endpoint:'

/** '\\' -> '/', repeated leading './' stripped. No leading-'/' strip, no case folding. */
export function normalizeSystemFilePath(raw: string): string {
  let path = raw.replace(/\\/g, '/')
  while (path.startsWith('./')) {
    path = path.slice(2)
  }
  return path
}

/** Recovers the source file path an engine node id encodes, or null for service/database nodes. */
export function systemNodeFilePath(nodeId: SystemNodeId): string | null {
  if (nodeId.startsWith(ROUTER_PREFIX)) {
    return normalizeSystemFilePath(nodeId.slice(ROUTER_PREFIX.length))
  }
  if (nodeId.startsWith(ENDPOINT_PREFIX)) {
    const rest = nodeId.slice(ENDPOINT_PREFIX.length)
    const hashIndex = rest.lastIndexOf('#')
    if (hashIndex === -1) return null
    return normalizeSystemFilePath(rest.slice(0, hashIndex))
  }
  return null
}

/** Stable cache key: sorted, deduped, newline-joined router/endpoint file paths. */
export function systemGraphFileSetKey(graph: SystemGraph): string {
  const paths = new Set<string>()
  for (const node of graph.nodes.values()) {
    if (node.kind !== 'router' && node.kind !== 'endpoint') continue
    const path = systemNodeFilePath(node.id)
    if (path !== null) paths.add(path)
  }
  return [...paths].sort().join('\n')
}

export type SystemFileDiffJoin = { graph: SystemGraph; matchedFileCount: number }

/** modified/renamed -> dirty, added/copied -> naciendo; deleted or unknown -> ignored (idle stays). */
const STATE_FOR_STATUS: Partial<Record<string, SystemNodeState>> = {
  modified: 'dirty',
  renamed: 'dirty',
  added: 'naciendo',
  copied: 'naciendo'
}

/**
 * Pure join: routers get the file's added/removed numbers, sibling endpoints get the state
 * without the diff (repeating the same file delta on N endpoints would multiply the churn).
 */
export function applyFileDiffToSystemGraph(
  graph: SystemGraph,
  entries: readonly GitStatusRow[]
): SystemFileDiffJoin {
  const byPath = new Map<string, GitStatusRow>()
  for (const entry of entries) {
    if (STATE_FOR_STATUS[entry.status] === undefined) continue
    byPath.set(normalizeSystemFilePath(entry.path), entry)
  }

  const matchedPaths = new Set<string>()
  const nodes: SystemNode[] = []
  for (const node of graph.nodes.values()) {
    const filePath =
      node.kind === 'router' || node.kind === 'endpoint' ? systemNodeFilePath(node.id) : null
    const entry = filePath !== null ? byPath.get(filePath) : undefined
    if (entry === undefined) {
      nodes.push(node)
      continue
    }
    matchedPaths.add(filePath as string)
    const state = STATE_FOR_STATUS[entry.status] as SystemNodeState
    nodes.push({
      ...node,
      state,
      diff: node.kind === 'router' ? { added: entry.added, removed: entry.removed } : null
    })
  }

  return {
    graph: buildSystemGraph({ nodes, edges: graph.edges }),
    matchedFileCount: matchedPaths.size
  }
}
