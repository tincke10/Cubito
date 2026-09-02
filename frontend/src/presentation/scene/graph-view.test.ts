import * as THREE from 'three'
import { describe, expect, it, vi } from 'vitest'
import { buildWorktreeGraph } from '../../domain/worktree-graph/build-graph'
import type { RawWorktreeRecord } from '../../domain/worktree-graph/build-graph'
import type { WorktreeGraph, WorktreeId } from '../../domain/worktree-graph/types'
import type { NodeLabelHandle } from '../hud/node-label-element'
import { darkPalette } from '../theme/scene-palette'
import { NODE_HALF_HEIGHT } from '../theme/scene-metrics'
import { createGraphView } from './graph-view'
import type { GraphView } from './graph-view'

type ActivityOverrides = Pick<RawWorktreeRecord, 'agentStatus' | 'isUnread' | 'isArchived'>

const record = (
  id: string,
  parent: string | null,
  children: readonly string[],
  extra: Partial<ActivityOverrides> = {}
): RawWorktreeRecord => {
  const raw: RawWorktreeRecord = {
    id,
    branch: `refs/heads/${id}`,
    parentWorktreeId: parent,
    childWorktreeIds: [...children],
    workspaceStatus: 'in-progress',
    git: { path: `/${id}`, isMainWorktree: parent === null }
  }
  if (extra.agentStatus !== undefined) raw.agentStatus = extra.agentStatus
  if (extra.isUnread !== undefined) raw.isUnread = extra.isUnread
  if (extra.isArchived !== undefined) raw.isArchived = extra.isArchived
  return raw
}

const graphOf = (...records: readonly RawWorktreeRecord[]): WorktreeGraph => buildWorktreeGraph(records)

/** root → (a, b) */
const baseGraph = (): WorktreeGraph =>
  graphOf(record('root', null, ['a', 'b']), record('a', 'root', []), record('b', 'root', []))

const fakeLabel = (): NodeLabelHandle => ({
  object: new THREE.Object3D() as unknown as NodeLabelHandle['object'],
  apply: vi.fn(),
  dispose: vi.fn()
})

type Harness = {
  view: GraphView
  scene: THREE.Object3D
  labelLayer: THREE.Object3D
  labels: NodeLabelHandle[]
  update(graph: WorktreeGraph, selectedId?: WorktreeId | null): void
}

const harness = (): Harness => {
  const scene = new THREE.Object3D()
  const labelLayer = new THREE.Object3D()
  const labels: NodeLabelHandle[] = []
  const view = createGraphView(scene, labelLayer, {
    createLabel: () => {
      const label = fakeLabel()
      labels.push(label)
      return label
    }
  })
  return {
    view,
    scene,
    labelLayer,
    labels,
    update(graph, selectedId = null) {
      view.update({ graph, selectedId, palette: darkPalette })
    }
  }
}

const nodeObject = (view: GraphView, id: WorktreeId): THREE.Object3D | undefined =>
  view.group.children.find((child) => child.userData.worktreeId === id)

const edgeObject = (view: GraphView, key: string): THREE.Object3D | undefined =>
  view.group.children.find((child) => child.userData.edgeKey === key)

const materialsUnder = (object: THREE.Object3D): THREE.Material[] => {
  const found = new Set<THREE.Material>()
  object.traverse((child) => {
    const material = (child as Partial<THREE.Mesh>).material
    if (!material) return
    for (const one of Array.isArray(material) ? material : [material]) found.add(one)
  })
  return [...found]
}

const ringOf = (object: THREE.Object3D): THREE.Object3D | undefined => object.getObjectByName('ring')

const ringedNodeIds = (view: GraphView, graph: WorktreeGraph): WorktreeId[] =>
  [...graph.nodes.keys()].filter((id) => {
    const object = nodeObject(view, id)
    return object !== undefined && ringOf(object)?.visible === true
  })

describe('createGraphView', () => {
  it('adds its group to the scene and one object per node and edge', () => {
    const h = harness()
    h.update(baseGraph())

    expect(h.scene.children).toContain(h.view.group)
    expect(nodeObject(h.view, 'root')).toBeDefined()
    expect(nodeObject(h.view, 'a')).toBeDefined()
    expect(edgeObject(h.view, 'root->a')).toBeDefined()
    expect(edgeObject(h.view, 'root->b')).toBeDefined()
  })

  it('reuses the same binding object for an unchanged node across an add + remove update', () => {
    const h = harness()
    h.update(baseGraph())
    const rootBefore = nodeObject(h.view, 'root')
    const aBefore = nodeObject(h.view, 'a')
    const edgeBefore = edgeObject(h.view, 'root->a')

    // 'b' removed, 'c' added — 'a' and 'root' are untouched.
    h.update(graphOf(record('root', null, ['a', 'c']), record('a', 'root', []), record('c', 'root', [])))

    expect(nodeObject(h.view, 'root')).toBe(rootBefore)
    expect(nodeObject(h.view, 'a')).toBe(aBefore)
    expect(edgeObject(h.view, 'root->a')).toBe(edgeBefore)
    expect(nodeObject(h.view, 'b')).toBeUndefined()
    expect(nodeObject(h.view, 'c')).toBeDefined()
  })

  it('keeps decoration child identity when only the surface colour changes', () => {
    const h = harness()
    h.update(baseGraph())
    const a = nodeObject(h.view, 'a')
    const ringBefore = a && ringOf(a)

    h.update(
      graphOf(
        record('root', null, ['a', 'b']),
        record('a', 'root', [], { agentStatus: 'working' }),
        record('b', 'root', [])
      )
    )

    expect(nodeObject(h.view, 'a')).toBe(a)
    expect(a && ringOf(a)).toBe(ringBefore)
  })

  it('disposes every material of a removed node (via the material dispose event)', () => {
    const h = harness()
    h.update(baseGraph())
    const b = nodeObject(h.view, 'b')
    expect(b).toBeDefined()
    const spy = vi.fn()
    for (const material of materialsUnder(b as THREE.Object3D)) {
      material.addEventListener('dispose', spy)
    }

    h.update(graphOf(record('root', null, ['a']), record('a', 'root', [])))

    expect(spy).toHaveBeenCalled()
    expect(h.view.group.children).not.toContain(b)
  })

  it('disposes a removed edge binding and drops it from the group', () => {
    const h = harness()
    h.update(baseGraph())
    const edge = edgeObject(h.view, 'root->b')
    expect(edge).toBeDefined()
    const spy = vi.fn()
    for (const material of materialsUnder(edge as THREE.Object3D)) {
      material.addEventListener('dispose', spy)
    }

    h.update(graphOf(record('root', null, ['a']), record('a', 'root', [])))

    expect(spy).toHaveBeenCalled()
    expect(edgeObject(h.view, 'root->b')).toBeUndefined()
  })

  it('disposes the removed node label and never touches surviving ones', () => {
    const h = harness()
    h.update(baseGraph())
    expect(h.labels).toHaveLength(3)
    const [rootLabel, , bLabel] = h.labels as [NodeLabelHandle, NodeLabelHandle, NodeLabelHandle]

    h.update(graphOf(record('root', null, ['a']), record('a', 'root', [])))

    expect(bLabel.dispose).toHaveBeenCalledTimes(1)
    expect(rootLabel.dispose).not.toHaveBeenCalled()
    expect(h.labelLayer.children).not.toContain(bLabel.object)
    expect(h.labelLayer.children).toContain(rootLabel.object)
  })

  it('never disposes the shared cube geometry when a node churns', () => {
    const h = harness()
    h.update(baseGraph())
    const surface = nodeObject(h.view, 'b')?.getObjectByName('surface') as THREE.Mesh | undefined
    expect(surface).toBeDefined()
    const spy = vi.fn()
    ;(surface as THREE.Mesh).geometry.addEventListener('dispose', spy)

    h.update(graphOf(record('root', null, ['a']), record('a', 'root', [])))
    h.update(baseGraph())

    expect(spy).not.toHaveBeenCalled()
  })

  it('keeps exactly one selection ring across selection changes', () => {
    const h = harness()
    const graph = baseGraph()

    h.update(graph, 'a')
    expect(ringedNodeIds(h.view, graph)).toEqual(['a'])

    h.update(graph, 'b')
    expect(ringedNodeIds(h.view, graph)).toEqual(['b'])

    h.update(graph, null)
    expect(ringedNodeIds(h.view, graph)).toEqual([])
  })

  it('reports node centres lifted by the elevation ladder, never on the ground plane', () => {
    const h = harness()
    const graph = baseGraph()
    h.update(graph)

    const rootCenter = h.view.nodeCenter('root')
    expect(rootCenter).not.toBeNull()
    expect(rootCenter?.y).toBeGreaterThan(NODE_HALF_HEIGHT)
    expect(h.view.nodeCenter('missing')).toBeNull()
    expect(h.view.nodeCenters()).toHaveLength(graph.nodes.size)
  })

  it('forwards setResolution to every edge material', () => {
    const h = harness()
    h.update(baseGraph())
    h.view.setResolution(800, 600)

    const edge = edgeObject(h.view, 'root->a') as THREE.Line
    const material = edge.material as THREE.Material & { resolution: THREE.Vector2 }
    expect(material.resolution.x).toBe(800)
    expect(material.resolution.y).toBe(600)
  })

  it('ticks edge flow from the global clock', () => {
    const h = harness()
    h.update(
      graphOf(record('root', null, ['a']), record('a', 'root', [], { agentStatus: 'working' }))
    )
    const edge = edgeObject(h.view, 'root->a') as THREE.Line
    const material = edge.material as THREE.Material & { dashOffset: number }

    h.view.tick(0)
    const atZero = material.dashOffset
    h.view.tick(0.3)

    expect(material.dashOffset).not.toBe(atZero)
  })

  it('disposes every binding and label on dispose and detaches from the scene', () => {
    const h = harness()
    h.update(baseGraph())
    const spy = vi.fn()
    for (const child of h.view.group.children) {
      for (const material of materialsUnder(child)) material.addEventListener('dispose', spy)
    }

    h.view.dispose()

    expect(spy).toHaveBeenCalled()
    expect(h.scene.children).not.toContain(h.view.group)
    for (const label of h.labels) expect(label.dispose).toHaveBeenCalled()
  })
})
