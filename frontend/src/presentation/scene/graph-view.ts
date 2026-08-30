import * as THREE from 'three'
import { layoutByLineage } from '../layout/lineage-layout'
import type { WorktreeGraph } from '../../domain/worktree-graph/types'

const NODE_RADIUS = 1.4
const RING_RADIUS = 8

const MAIN_COLOR = 0x9fef00
const WORKTREE_COLOR = 0x2ea8ff
const EDGE_COLOR = 0x3a5f3a

/**
 * Renders the worktree graph into a THREE.Group and rebuilds it on update.
 * Placeholder visuals: cubes for worktrees (it is Cubito, after all), a
 * glowing cube for main, lines for lineage. The real design replaces this.
 */
export function createGraphView(scene: THREE.Scene): {
  update(graph: WorktreeGraph): void
  group: THREE.Group
} {
  const group = new THREE.Group()
  scene.add(group)

  const update = (graph: WorktreeGraph): void => {
    group.clear()
    const positions = layoutByLineage(graph, { radius: RING_RADIUS })

    for (const node of graph.nodes.values()) {
      const pos = positions.get(node.id)
      if (!pos) {
        continue
      }
      const geometry = new THREE.BoxGeometry(
        NODE_RADIUS * 2,
        NODE_RADIUS * 2,
        NODE_RADIUS * 2
      )
      const material = new THREE.MeshStandardMaterial({
        color: node.isMain ? MAIN_COLOR : WORKTREE_COLOR,
        emissive: node.isMain ? MAIN_COLOR : WORKTREE_COLOR,
        emissiveIntensity: node.isMain ? 0.5 : 0.2,
        metalness: 0.3,
        roughness: 0.4
      })
      const mesh = new THREE.Mesh(geometry, material)
      mesh.position.set(pos.x, pos.y, pos.z)
      mesh.userData.worktreeId = node.id
      group.add(mesh)
    }

    for (const edge of graph.edges) {
      const from = positions.get(edge.from)
      const to = positions.get(edge.to)
      if (!from || !to) {
        continue
      }
      const geometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(from.x, from.y, from.z),
        new THREE.Vector3(to.x, to.y, to.z)
      ])
      const material = new THREE.LineBasicMaterial({ color: EDGE_COLOR })
      group.add(new THREE.Line(geometry, material))
    }
  }

  return { update, group }
}
