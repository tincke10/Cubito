import { createSceneStore } from './application/scene-store'
import { syncWorktreeGraph } from './application/sync-worktree-graph'
import { createLiveWorktreeSync } from './application/live-worktree-sync'
import { decidePairingEntry } from './application/pairing-entry-decision'
import { connectOrcad } from './infrastructure/rpc/connect-orcad'
import { consumePairingFragment } from './infrastructure/rpc/pairing-fragment'
import type { RuntimeGateway } from './application/ports/runtime-gateway'
import type { RawWorktreeRecord } from './domain/worktree-graph/build-graph'
import { frameAll } from './presentation/camera/camera-framing'
import { createHudOverlay } from './presentation/hud/hud-overlay'
import { hudModel } from './presentation/hud/hud-model'
import { createKeyboardBar } from './presentation/hud/keyboard-bar'
import { createKeyboardController } from './presentation/input/keyboard-controller'
import { createCameraRig } from './presentation/scene/camera-rig'
import { createScene } from './presentation/scene/create-scene'
import { createGraphView } from './presentation/scene/graph-view'
import { applyCssTheme } from './presentation/theme/css-theme'
import { paletteFor } from './presentation/theme/scene-palette'
import type { Theme } from './presentation/theme/scene-palette'

// Demo gateway until the orcad connection (pairing or local bridge) lands.
// Shape matches the real `worktree.list` payload observed against orcad; the optional
// activity fields exercise the state ladder for the visual calibration pass.
const demoRecords: RawWorktreeRecord[] = [
  {
    id: 'demo::/repo',
    branch: 'refs/heads/main',
    parentWorktreeId: null,
    childWorktreeIds: ['demo::/wt/alpha', 'demo::/wt/beta', 'demo::/wt/delta'],
    workspaceStatus: 'in-progress',
    git: { path: '/repo', isMainWorktree: true }
  },
  {
    id: 'demo::/wt/alpha',
    branch: 'refs/heads/cubito-alpha',
    parentWorktreeId: 'demo::/repo',
    childWorktreeIds: ['demo::/wt/gamma'],
    workspaceStatus: 'in-progress',
    git: { path: '/wt/alpha', isMainWorktree: false },
    agentStatus: 'working'
  },
  {
    id: 'demo::/wt/beta',
    branch: 'refs/heads/cubito-beta',
    parentWorktreeId: 'demo::/repo',
    childWorktreeIds: [],
    workspaceStatus: 'in-progress',
    git: { path: '/wt/beta', isMainWorktree: false },
    agentStatus: 'waiting-input'
  },
  {
    id: 'demo::/wt/gamma',
    branch: 'refs/heads/cubito-gamma',
    parentWorktreeId: 'demo::/wt/alpha',
    childWorktreeIds: [],
    workspaceStatus: 'in-progress',
    git: { path: '/wt/gamma', isMainWorktree: false },
    isUnread: true,
    diff: { added: 412, removed: 38 }
  },
  {
    id: 'demo::/wt/delta',
    branch: 'refs/heads/cubito-delta',
    parentWorktreeId: 'demo::/repo',
    childWorktreeIds: [],
    workspaceStatus: 'archived',
    git: { path: '/wt/delta', isMainWorktree: false },
    isArchived: true
  }
]

const demoGateway: RuntimeGateway = {
  listWorktrees: async () => demoRecords
}

const container = document.getElementById('app')
const hud = document.getElementById('hud')
const keyboardBarSlot = document.getElementById('keyboard-bar')
if (!container || !hud || !keyboardBarSlot) {
  throw new Error('index.html must provide #app, #hud and #keyboard-bar')
}

const theme: Theme = 'dark'
const palette = paletteFor(theme)
applyCssTheme(document.documentElement, palette)

const cubitoScene = createScene(container, palette)
const graphView = createGraphView(cubitoScene.scene, cubitoScene.labelLayer)
const cameraRig = createCameraRig(cubitoScene.camera, cubitoScene.controls)
const store = createSceneStore()

const hudOverlay = createHudOverlay()
hud.appendChild(hudOverlay.root)
const keyboardBar = createKeyboardBar()
keyboardBarSlot.appendChild(keyboardBar.root)

const platform = { isMac: navigator.userAgent.includes('Mac') }

const keyboardController = createKeyboardController({
  store,
  cameraRig,
  scenePositions: graphView
})
keyboardController.attach(window)

cubitoScene.onFrame((elapsedSeconds) => {
  graphView.tick(elapsedSeconds)
  cameraRig.tick(elapsedSeconds)
})

cubitoScene.onResize((width, height) => {
  cameraRig.setAspect(width / height)
  graphView.setResolution(width, height)
})

// The first non-empty graph gets an initial fit; afterwards the camera is the user's.
let framed = false

store.subscribe((state) => {
  graphView.update({ graph: state.graph, selectedId: state.selection.selectedId, palette })
  const model = hudModel(state, platform)
  hudOverlay.apply(model)
  keyboardBar.apply(model.chips)
  if (!framed && state.graph.nodes.size > 0) {
    framed = true
    cameraRig.apply(frameAll(graphView.nodeCenters()))
  }
})

const pairingEntry = decidePairingEntry(consumePairingFragment())
if (pairingEntry.kind === 'connect') {
  createLiveWorktreeSync({
    connect: () => connectOrcad(pairingEntry.offer),
    store,
    isDocumentHidden: () => document.hidden,
    onVisibilityChange: (cb) => {
      document.addEventListener('visibilitychange', cb)
      return () => document.removeEventListener('visibilitychange', cb)
    }
  }).start()
} else {
  store.update({ connection: { state: 'down', reason: pairingEntry.reason } })
  void syncWorktreeGraph(demoGateway, store) // `pnpm dev` stays usable with no container
}
