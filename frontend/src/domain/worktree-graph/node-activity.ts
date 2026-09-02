export type AgentStatus = 'idle' | 'working' | 'waiting-input'

export type DiffSummary = {
  added: number
  removed: number
}

export type SpawnProgress = {
  phase: string
  progress: number
}

export type NodeActivity = {
  agentStatus: AgentStatus
  isUnread: boolean
  isArchived: boolean
  lastActivityAt: number | null
  diff: DiffSummary | null
  spawn: SpawnProgress | null
}

export const inertActivity = (): NodeActivity => ({
  agentStatus: 'idle',
  isUnread: false,
  isArchived: false,
  lastActivityAt: null,
  diff: null,
  spawn: null
})
