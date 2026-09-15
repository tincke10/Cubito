import { describe, expect, it } from 'vitest'
import { activateIsland, islandLanding, selectNode } from './island-focus'
import type { IslandFocus, IslandSelections } from './island-focus'
import type { WorktreeGraph, WorktreeNode } from '../domain/worktree-graph/types'
import { inertActivity } from '../domain/worktree-graph/node-activity'

const node = (id: string, repoId: string, isMain = false): WorktreeNode => ({
  id,
  repoId,
  branch: id,
  path: `/${id}`,
  status: 'clean',
  isMain,
  kind: isMain ? 'root' : 'worktree',
  parentId: null,
  childIds: [],
  activity: inertActivity()
})

const twoIslandGraph = (): WorktreeGraph => {
  const nodes = [node('a-main', 'a', true), node('a-x', 'a'), node('b-main', 'b', true)]
  return { nodes: new Map(nodes.map((n) => [n.id, n])), edges: [], rootIds: nodes.map((n) => n.id) }
}

const focus = (overrides: Partial<IslandFocus> = {}): IslandFocus => ({
  activeRepoId: null,
  selectedId: null,
  islandSelections: new Map(),
  ...overrides
})

describe('islandLanding', () => {
  it('keeps the current pick when it is already inside the island', () => {
    const graph = twoIslandGraph()
    expect(islandLanding(graph, 'a', 'a-x', new Map())).toBe('a-x')
  })

  it('falls back to the remembered pick when the current one is elsewhere', () => {
    const graph = twoIslandGraph()
    const remembered: IslandSelections = new Map([['a', 'a-x']])
    expect(islandLanding(graph, 'a', 'b-main', remembered)).toBe('a-x')
  })

  it('falls back to island entry when neither the current nor a remembered pick lives there', () => {
    const graph = twoIslandGraph()
    expect(islandLanding(graph, 'a', 'b-main', new Map())).toBe('a-main')
  })

  it('falls back to island entry when the remembered pick no longer exists in that island', () => {
    const graph = twoIslandGraph()
    const remembered: IslandSelections = new Map([['a', 'ghost']])
    expect(islandLanding(graph, 'a', 'b-main', remembered)).toBe('a-main')
  })

  it('returns null for an island with no nodes', () => {
    const graph = twoIslandGraph()
    expect(islandLanding(graph, 'c', null, new Map())).toBeNull()
  })
})

describe('activateIsland', () => {
  it('remembers the outgoing pick when it belongs to the outgoing island', () => {
    const graph = twoIslandGraph()
    const result = activateIsland(graph, focus({ activeRepoId: 'a', selectedId: 'a-x' }), 'b')
    expect(result.islandSelections.get('a')).toBe('a-x')
    expect(result.activeRepoId).toBe('b')
    expect(result.selectedId).toBe('b-main')
  })

  it('does not remember a pick that does not belong to the outgoing island', () => {
    const graph = twoIslandGraph()
    // selectedId already lives in 'b', not the outgoing 'a' — stale from an earlier bypass.
    const result = activateIsland(graph, focus({ activeRepoId: 'a', selectedId: 'b-main' }), 'b')
    expect(result.islandSelections.has('a')).toBe(false)
  })

  it('keeps the selection unchanged when repoId is null', () => {
    const graph = twoIslandGraph()
    const result = activateIsland(graph, focus({ activeRepoId: 'a', selectedId: 'a-x' }), null)
    expect(result.activeRepoId).toBeNull()
    expect(result.selectedId).toBe('a-x')
  })
})

describe('selectNode', () => {
  it('a same-island pick just updates selectedId', () => {
    const graph = twoIslandGraph()
    const result = selectNode(graph, focus({ activeRepoId: 'a', selectedId: 'a-main' }), 'a-x')
    expect(result).toEqual(focus({ activeRepoId: 'a', selectedId: 'a-x' }))
  })

  it('a cross-island pick activates that island and keeps the pick', () => {
    const graph = twoIslandGraph()
    const result = selectNode(graph, focus({ activeRepoId: 'a', selectedId: 'a-x' }), 'b-main')
    expect(result.activeRepoId).toBe('b')
    expect(result.selectedId).toBe('b-main')
    expect(result.islandSelections.get('a')).toBe('a-x')
  })

  it('an unknown id just updates selectedId without activating', () => {
    const graph = twoIslandGraph()
    const result = selectNode(graph, focus({ activeRepoId: 'a', selectedId: 'a-x' }), 'ghost')
    expect(result.activeRepoId).toBe('a')
    expect(result.selectedId).toBe('ghost')
  })
})
