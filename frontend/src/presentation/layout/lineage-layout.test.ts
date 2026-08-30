import { describe, expect, it } from 'vitest'
import { layoutByLineage } from './lineage-layout'
import { buildWorktreeGraph } from '../../domain/worktree-graph/build-graph'
import type { RawWorktreeRecord } from '../../domain/worktree-graph/build-graph'

const record = (
  id: string,
  parent: string | null,
  isMain = false
): RawWorktreeRecord => ({
  id,
  branch: `refs/heads/${id}`,
  parentWorktreeId: parent,
  childWorktreeIds: [],
  workspaceStatus: 'in-progress',
  git: { path: `/${id}`, isMainWorktree: isMain }
})

describe('layoutByLineage', () => {
  it('places a single root at the origin', () => {
    const graph = buildWorktreeGraph([record('root', null, true)])
    const positions = layoutByLineage(graph, { radius: 10 })
    expect(positions.get('root')).toEqual({ x: 0, y: 0, z: 0 })
  })

  it('places children on a ring one radius away from their parent', () => {
    const graph = buildWorktreeGraph([
      record('root', null, true),
      record('a', 'root'),
      record('b', 'root')
    ])
    const positions = layoutByLineage(graph, { radius: 10 })
    for (const id of ['a', 'b']) {
      const p = positions.get(id)
      expect(p).toBeDefined()
      const distance = Math.hypot(p!.x, p!.y, p!.z)
      expect(distance).toBeCloseTo(10, 5)
    }
  })

  it('gives siblings distinct positions', () => {
    const graph = buildWorktreeGraph([
      record('root', null, true),
      record('a', 'root'),
      record('b', 'root')
    ])
    const positions = layoutByLineage(graph, { radius: 10 })
    expect(positions.get('a')).not.toEqual(positions.get('b'))
  })

  it('is deterministic for the same graph', () => {
    const rows = [record('root', null, true), record('a', 'root'), record('b', 'a')]
    const first = layoutByLineage(buildWorktreeGraph(rows), { radius: 8 })
    const second = layoutByLineage(buildWorktreeGraph(rows), { radius: 8 })
    expect(first).toEqual(second)
  })

  it('assigns every node a position, including extra roots', () => {
    const graph = buildWorktreeGraph([
      record('root', null, true),
      record('island', null),
      record('a', 'root')
    ])
    const positions = layoutByLineage(graph, { radius: 10 })
    expect(positions.size).toBe(3)
  })
})
