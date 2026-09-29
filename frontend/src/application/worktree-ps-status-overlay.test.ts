import { describe, expect, it } from 'vitest'
import { applyPsStatusToGraph } from './worktree-ps-status-overlay'
import { inertActivity } from '../domain/worktree-graph/node-activity'
import type { WorktreeGraph, WorktreeNode } from '../domain/worktree-graph/types'
import type { AgentStatus } from '../domain/worktree-graph/node-activity'

const node = (id: string, agentStatus: AgentStatus = 'idle'): WorktreeNode => ({
  id,
  repoId: 'repo',
  branch: id,
  path: `/${id}`,
  status: 'in-progress',
  isMain: false,
  kind: 'worktree',
  parentId: null,
  childIds: [],
  activity: {
    ...inertActivity(),
    agentStatus,
    diff: { added: 3, removed: 1 },
    spawn: { phase: 'x', progress: 0.5 }
  }
})

const graphOf = (...nodes: WorktreeNode[]): WorktreeGraph => ({
  nodes: new Map(nodes.map((n) => [n.id, n])),
  edges: [],
  rootIds: nodes.map((n) => n.id)
})

const statusOf = (graph: WorktreeGraph, id: string) => graph.nodes.get(id)?.activity.agentStatus

describe('applyPsStatusToGraph', () => {
  it('projects working and permission rows onto their nodes', () => {
    const result = applyPsStatusToGraph(
      graphOf(node('a'), node('b')),
      [
        { worktreeId: 'a', status: 'working' },
        { worktreeId: 'b', status: 'permission' }
      ],
      null
    )
    expect(statusOf(result, 'a')).toBe('working')
    expect(statusOf(result, 'b')).toBe('waiting-input')
  })

  it.each(['done', 'inactive', 'active'])('maps %s to idle', (status) => {
    const result = applyPsStatusToGraph(
      graphOf(node('a', 'working')),
      [{ worktreeId: 'a', status }],
      null
    )
    expect(statusOf(result, 'a')).toBe('idle')
  })

  it('makes a node with no row idle', () => {
    expect(statusOf(applyPsStatusToGraph(graphOf(node('a', 'working')), [], null), 'a')).toBe(
      'idle'
    )
  })

  it('ignores unknown worktree ids, preserves other fields, and does not mutate the input', () => {
    const input = graphOf(node('a'))
    const result = applyPsStatusToGraph(
      input,
      [
        { worktreeId: 'a', status: 'working' },
        { worktreeId: 'ghost', status: 'working' }
      ],
      null
    )
    expect(result.nodes.size).toBe(1)
    expect(result.nodes.get('a')?.activity.diff).toEqual({ added: 3, removed: 1 })
    expect(result.nodes.get('a')?.activity.spawn).toEqual({ phase: 'x', progress: 0.5 })
    expect(statusOf(input, 'a')).toBe('idle')
  })

  it('keeps previous statuses for surviving ids when rows are null; new ids are idle', () => {
    const result = applyPsStatusToGraph(
      graphOf(node('a'), node('fresh')),
      null,
      graphOf(node('a', 'working'), node('gone', 'working'))
    )
    expect(statusOf(result, 'a')).toBe('working')
    expect(statusOf(result, 'fresh')).toBe('idle')
    expect(result.nodes.has('gone')).toBe(false)
  })
})
