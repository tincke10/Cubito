import * as THREE from 'three'
import type { WorktreeGraph, WorktreeId } from '../../domain/worktree-graph/types'
import type { Vec3 } from '../camera/camera-framing'
import { createNodeLabel } from '../hud/node-label-element'
import type { NodeLabelHandle } from '../hud/node-label-element'
import { nodeLabelModel } from '../hud/node-label-model'
import { layoutByIsoLineage } from '../layout/iso-lineage-layout'
import { edgeVisual } from '../theme/edge-visual'
import { elevationFor } from '../theme/node-elevation'
import { deriveDecorations, deriveNodeState } from '../theme/node-state'
import type { NodeState } from '../theme/node-state'
import { nodeVisual } from '../theme/node-visual'
import type { ScenePalette } from '../theme/scene-palette'
import { NODE_HALF_HEIGHT } from '../theme/scene-metrics'
import { createEdgeBinding } from './edge-line'
import type { EdgeBinding } from './edge-line'
import { createNodeBinding } from './node-mesh'
import type { NodeBinding } from './node-mesh'
import { createSceneResources } from './scene-resources'

export type GraphViewInput = {
  graph: WorktreeGraph
  selectedId: WorktreeId | null
  palette: ScenePalette
}

/** Injectable so the reconciliation suite runs under `environment:'node'`, where the real
 *  `CSS2DObject` label writer has no `document`. */
export type GraphViewOptions = {
  createLabel?: () => NodeLabelHandle
}

export type GraphView = {
  group: THREE.Group
  update(input: GraphViewInput): void
  tick(elapsedSeconds: number): void
  setResolution(width: number, height: number): void
  nodeCenter(id: WorktreeId): Vec3 | null
  nodeCenters(): Vec3[]
  dispose(): void
}

type NodeEntry = { binding: NodeBinding; label: NodeLabelHandle }

const edgeKey = (from: WorktreeId, to: WorktreeId): string => `${from}->${to}`

/**
 * Keyed reconciliation between the domain graph and its THREE bindings (design §5.6):
 * bindings are reused by node id / `from->to` edge key across updates, absent keys are
 * swept and disposed, and nothing is ever rebuilt wholesale — `group.clear()` would
 * detach without disposing, which is the leak this replaces. All visual decisions come
 * from the pure theme pipeline; this file only binds their output to objects.
 */
export function createGraphView(
  scene: THREE.Object3D,
  labelLayer: THREE.Object3D,
  options?: GraphViewOptions
): GraphView {
  const group = new THREE.Group()
  scene.add(group)

  const resources = createSceneResources()
  const makeLabel = options?.createLabel ?? createNodeLabel
  const nodes = new Map<WorktreeId, NodeEntry>()
  const edges = new Map<string, EdgeBinding>()
  const centers = new Map<WorktreeId, Vec3>()
  const states = new Map<WorktreeId, NodeState>()
  let resolution: { width: number; height: number } | null = null

  const dropNode = (id: WorktreeId, entry: NodeEntry): void => {
    group.remove(entry.binding.object)
    labelLayer.remove(entry.label.object)
    entry.binding.dispose()
    entry.label.dispose()
    nodes.delete(id)
    centers.delete(id)
    states.delete(id)
  }

  const dropEdge = (key: string, binding: EdgeBinding): void => {
    group.remove(binding.object)
    binding.dispose()
    edges.delete(key)
  }

  const syncNodes = ({ graph, selectedId, palette }: GraphViewInput): void => {
    const positions = layoutByIsoLineage(graph)

    for (const node of graph.nodes.values()) {
      const ground = positions.get(node.id)
      if (!ground) continue

      const state = deriveNodeState(node)
      const decorations = deriveDecorations(node, node.id === selectedId)
      const elevation = elevationFor(state, node.kind)
      const label = nodeLabelModel(node, state, decorations)

      let entry = nodes.get(node.id)
      if (!entry) {
        const binding = createNodeBinding(resources)
        binding.object.userData.worktreeId = node.id
        group.add(binding.object)
        const labelHandle = makeLabel()
        labelLayer.add(labelHandle.object)
        entry = { binding, label: labelHandle }
        nodes.set(node.id, entry)
      }

      entry.binding.apply({
        visual: nodeVisual(node.kind, state, decorations, palette),
        elevation,
        ground,
        label,
        shadowColor: palette.shadow
      })
      entry.label.apply(label)
      entry.label.object.position.set(ground.x, 0, ground.z)

      states.set(node.id, state)
      centers.set(node.id, { x: ground.x, y: elevation.height + NODE_HALF_HEIGHT, z: ground.z })
    }

    for (const [id, entry] of [...nodes]) {
      if (!graph.nodes.has(id)) dropNode(id, entry)
    }
  }

  const syncEdges = ({ graph, palette }: GraphViewInput): void => {
    const live = new Set<string>()

    for (const edge of graph.edges) {
      const from = centers.get(edge.from)
      const to = centers.get(edge.to)
      const fromState = states.get(edge.from)
      const toState = states.get(edge.to)
      if (!from || !to || !fromState || !toState) continue

      const key = edgeKey(edge.from, edge.to)
      live.add(key)
      let binding = edges.get(key)
      if (!binding) {
        binding = createEdgeBinding()
        binding.object.userData.edgeKey = key
        if (resolution) binding.setResolution(resolution.width, resolution.height)
        group.add(binding.object)
        edges.set(key, binding)
      }
      binding.apply({ visual: edgeVisual(fromState, toState, palette), from, to })
    }

    for (const [key, binding] of [...edges]) {
      if (!live.has(key)) dropEdge(key, binding)
    }
  }

  return {
    group,
    update(input: GraphViewInput): void {
      syncNodes(input)
      syncEdges(input)
    },
    tick(elapsedSeconds: number): void {
      for (const entry of nodes.values()) entry.binding.tick(elapsedSeconds)
      for (const binding of edges.values()) binding.tick(elapsedSeconds)
    },
    setResolution(width: number, height: number): void {
      resolution = { width, height }
      for (const binding of edges.values()) binding.setResolution(width, height)
    },
    nodeCenter(id: WorktreeId): Vec3 | null {
      return centers.get(id) ?? null
    },
    nodeCenters(): Vec3[] {
      return [...centers.values()]
    },
    dispose(): void {
      for (const [id, entry] of [...nodes]) dropNode(id, entry)
      for (const [key, binding] of [...edges]) dropEdge(key, binding)
      resources.dispose()
      scene.remove(group)
    }
  }
}
