export type WorktreeId = string

export type WorktreeNode = {
  id: WorktreeId
  branch: string
  path: string
  status: string
  isMain: boolean
  parentId: WorktreeId | null
  childIds: readonly WorktreeId[]
}

/** Directed lineage edge: the worktree at `from` spawned the one at `to`. */
export type WorktreeEdge = {
  from: WorktreeId
  to: WorktreeId
}

export type WorktreeGraph = {
  nodes: ReadonlyMap<WorktreeId, WorktreeNode>
  edges: readonly WorktreeEdge[]
  rootIds: readonly WorktreeId[]
}

export const emptyWorktreeGraph = (): WorktreeGraph => ({
  nodes: new Map(),
  edges: [],
  rootIds: []
})
