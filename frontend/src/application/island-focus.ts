import type { WorktreeGraph, WorktreeId } from '../domain/worktree-graph/types'
import { islandEntrySelection } from '../presentation/navigation/selection-model'

export type IslandSelections = ReadonlyMap<string, WorktreeId>

export type IslandFocus = {
  activeRepoId: string | null
  selectedId: WorktreeId | null
  islandSelections: IslandSelections
}

const repoOf = (graph: WorktreeGraph, id: WorktreeId | null | undefined): string | null =>
  id == null ? null : (graph.nodes.get(id)?.repoId ?? null)

/** Where the ring lands on `repoId`: the current pick if already there, else its remembered pick if still there, else its entry (main). */
export function islandLanding(
  graph: WorktreeGraph,
  repoId: string,
  currentId: WorktreeId | null,
  remembered: IslandSelections
): WorktreeId | null {
  if (repoOf(graph, currentId) === repoId) return currentId
  const recalled = remembered.get(repoId)
  if (repoOf(graph, recalled) === repoId) return recalled ?? null
  return islandEntrySelection(graph, repoId)
}

/** Any activeRepoId change: remember the outgoing island's pick, land the incoming one. */
export function activateIsland(
  graph: WorktreeGraph,
  focus: IslandFocus,
  repoId: string | null
): IslandFocus {
  const islandSelections = new Map(focus.islandSelections)
  const { activeRepoId: from, selectedId } = focus
  if (from !== null && selectedId !== null && repoOf(graph, selectedId) === from) {
    islandSelections.set(from, selectedId)
  }
  if (repoId === null) return { activeRepoId: null, selectedId, islandSelections }
  return {
    activeRepoId: repoId,
    selectedId: islandLanding(graph, repoId, selectedId, islandSelections),
    islandSelections
  }
}

/** A user pick: the island follows a pick that lives in another repo. */
export function selectNode(
  graph: WorktreeGraph,
  focus: IslandFocus,
  id: WorktreeId | null
): IslandFocus {
  const repoId = repoOf(graph, id)
  if (repoId === null || repoId === focus.activeRepoId) return { ...focus, selectedId: id }
  return { ...activateIsland(graph, focus, repoId), selectedId: id }
}
