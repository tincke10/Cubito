import { describe, expect, it } from 'vitest'
import { layoutByLineage } from './lineage-layout'
import { layoutByIsoLineage } from './iso-lineage-layout'
import { inertActivity } from '../../domain/worktree-graph/node-activity'
import type { WorktreeGraph, WorktreeNode } from '../../domain/worktree-graph/types'

const node = (overrides: Partial<WorktreeNode> & Pick<WorktreeNode, 'id'>): WorktreeNode => ({
  branch: `refs/heads/${overrides.id}`,
  path: `/path/${overrides.id}`,
  status: 'in-progress',
  isMain: false,
  kind: 'worktree',
  parentId: null,
  childIds: [],
  activity: inertActivity(),
  ...overrides
})

const graphOf = (nodes: readonly WorktreeNode[]): WorktreeGraph => ({
  nodes: new Map(nodes.map((n) => [n.id, n])),
  edges: [],
  rootIds: nodes.filter((n) => n.parentId === null).map((n) => n.id)
})

/**
 * `layoutByLineage` is a compatibility shim kept only because `scene/graph-view.ts`
 * still imports it (see lineage-layout.ts docstring). Its real behavior now lives in,
 * and is fully tested by, `iso-lineage-layout.test.ts` — this file only proves the
 * shim delegates correctly and ignores its legacy `radius` option.
 */
describe('layoutByLineage (compatibility shim over layoutByIsoLineage)', () => {
  it('delegates to layoutByIsoLineage regardless of the legacy radius option', () => {
    const graph = graphOf([
      node({ id: 'root', isMain: true, kind: 'root', childIds: ['a', 'b'] }),
      node({ id: 'a', parentId: 'root' }),
      node({ id: 'b', parentId: 'root' })
    ])
    expect(layoutByLineage(graph, { radius: 999 })).toEqual(layoutByIsoLineage(graph))
    expect(layoutByLineage(graph, { radius: 1 })).toEqual(layoutByIsoLineage(graph))
  })

  it('still assigns every node a position, keeping graph-view.ts working unmodified', () => {
    const graph = graphOf([
      node({ id: 'root', isMain: true, kind: 'root', childIds: ['a'] }),
      node({ id: 'island', kind: 'root' }),
      node({ id: 'a', parentId: 'root' })
    ])
    const positions = layoutByLineage(graph, { radius: 10 })
    expect(positions.size).toBe(3)
  })
})
