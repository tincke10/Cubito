import { createGraphStore } from './application/graph-store'
import { syncWorktreeGraph } from './application/sync-worktree-graph'
import { createScene } from './presentation/scene/create-scene'
import { createGraphView } from './presentation/scene/graph-view'
import type { RuntimeGateway } from './application/ports/runtime-gateway'
import type { RawWorktreeRecord } from './domain/worktree-graph/build-graph'

// Demo gateway until the orcad connection (pairing or local bridge) lands.
// Shape matches the real `worktree.list` payload observed against orcad.
const demoRecords: RawWorktreeRecord[] = [
  {
    id: 'demo::/repo',
    branch: 'refs/heads/main',
    parentWorktreeId: null,
    childWorktreeIds: ['demo::/wt/alpha', 'demo::/wt/beta'],
    workspaceStatus: 'in-progress',
    git: { path: '/repo', isMainWorktree: true }
  },
  {
    id: 'demo::/wt/alpha',
    branch: 'refs/heads/cubito-alpha',
    parentWorktreeId: 'demo::/repo',
    childWorktreeIds: ['demo::/wt/gamma'],
    workspaceStatus: 'in-progress',
    git: { path: '/wt/alpha', isMainWorktree: false }
  },
  {
    id: 'demo::/wt/beta',
    branch: 'refs/heads/cubito-beta',
    parentWorktreeId: 'demo::/repo',
    childWorktreeIds: [],
    workspaceStatus: 'in-progress',
    git: { path: '/wt/beta', isMainWorktree: false }
  },
  {
    id: 'demo::/wt/gamma',
    branch: 'refs/heads/cubito-gamma',
    parentWorktreeId: 'demo::/wt/alpha',
    childWorktreeIds: [],
    workspaceStatus: 'in-progress',
    git: { path: '/wt/gamma', isMainWorktree: false }
  }
]

const demoGateway: RuntimeGateway = {
  listWorktrees: async () => demoRecords
}

const container = document.getElementById('app')
const hud = document.getElementById('hud')
if (!container || !hud) {
  throw new Error('index.html must provide #app and #hud')
}

const { scene } = createScene(container)
const graphView = createGraphView(scene)
const store = createGraphStore()

store.subscribe((state) => {
  graphView.update(state.graph)
  const sync = state.sync
  const status =
    sync.state === 'synced'
      ? `synced ${new Date(sync.at).toLocaleTimeString()}`
      : sync.state === 'error'
        ? `error: ${sync.code}`
        : sync.state
  hud.innerText = [
    'CUBITO — worktree graph',
    `nodes: ${state.graph.nodes.size}  edges: ${state.graph.edges.length}`,
    `runtime: demo gateway (${status})`,
    'drag: orbit · wheel: zoom'
  ].join('\n')
})

void syncWorktreeGraph(demoGateway, store)
