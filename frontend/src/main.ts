import * as THREE from 'three'
import { createSceneStore } from './application/scene-store'
import { syncWorktreeGraph } from './application/sync-worktree-graph'
import { createLiveWorktreeSync } from './application/live-worktree-sync'
import type { LiveSyncConnection } from './application/live-worktree-sync'
import { decidePairingEntry } from './application/pairing-entry-decision'
import { connectOrcad } from './infrastructure/rpc/connect-orcad'
import { consumePairingFragment } from './infrastructure/rpc/pairing-fragment'
import type { RuntimeGateway } from './application/ports/runtime-gateway'
import type { RawWorktreeRecord } from './domain/worktree-graph/build-graph'
import { frameAll } from './presentation/camera/camera-framing'
import type { Vec3 } from './presentation/camera/camera-framing'
import { createHudOverlay } from './presentation/hud/hud-overlay'
import { hudModel } from './presentation/hud/hud-model'
import { createKeyboardBar } from './presentation/hud/keyboard-bar'
import { createTerminalConnector } from './presentation/hud/terminal-connector-element'
import { createTerminalPanel } from './presentation/hud/terminal-panel-element'
import { createTerminalPanelController } from './presentation/hud/terminal-panel-controller'
import type { TerminalPanelController } from './presentation/hud/terminal-panel-controller'
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
const hudElement: HTMLElement = hud

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

// Terminal (design Area 6/7/8): the panel controller needs a live `TerminalStreamPort`, which
// only exists once the paired connection resolves — it is built lazily on the first
// `onConnected` below and rebound (not recreated) on every reconnect. The keyboard controller
// is constructed before that, so it talks to it through a closure-backed proxy.
let terminalController: TerminalPanelController | null = null
let viewportSize = { width: window.innerWidth, height: window.innerHeight }

const keyboardController = createKeyboardController({
  store,
  cameraRig,
  scenePositions: graphView,
  terminal: {
    focusActivePanel: () => terminalController?.focusActivePanel(),
    closeActiveSession: () => terminalController?.closeActiveSession()
  }
})
keyboardController.attach(window)

// Click-away exit: only a mousedown that lands directly on the WebGL canvas counts as
// "away" — the in-scene terminal panel's CSS2DObject is also a `container` descendant
// (positioned above the canvas), so a click inside it must never blur it right back out.
container.addEventListener('mousedown', (event) => {
  if (event.target === cubitoScene.renderer.domElement) {
    terminalController?.exitFocus()
  }
})

cubitoScene.onFrame((elapsedSeconds) => {
  graphView.tick(elapsedSeconds)
  cameraRig.tick(elapsedSeconds)
  terminalController?.tick()
})

cubitoScene.onResize((width, height) => {
  cameraRig.setAspect(width / height)
  graphView.setResolution(width, height)
  viewportSize = { width, height }
})

// The first non-empty graph gets an initial fit; afterwards the camera is the user's.
let framed = false

store.subscribe((state) => {
  graphView.update({ graph: state.graph, selectedId: state.selection.selectedId, palette })
  const model = hudModel(state, platform)
  hudOverlay.apply(model)
  keyboardBar.apply(model.chips)
  terminalController?.sync(state.terminals)
  if (!framed && state.graph.nodes.size > 0) {
    framed = true
    cameraRig.apply(frameAll(graphView.nodeCenters()))
  }
})

/** Impure THREE camera projection (design Area 6) — the only place this math is allowed to
 *  touch `three` directly; the pure remainder lives in terminal-connector-projector.ts. */
const projectWorldToNdc = (world: Vec3): { x: number; y: number; z: number } => {
  const vector = new THREE.Vector3(world.x, world.y, world.z)
  vector.project(cubitoScene.camera)
  return { x: vector.x, y: vector.y, z: vector.z }
}

/** Builds the terminal controller on the first connection, rebinds its port on every
 *  reconnect thereafter (design Area 7) — the xterm instance/DOM panel is never recreated. */
function bindTerminals(connection: LiveSyncConnection): void {
  if (terminalController) {
    terminalController.rebind(connection.terminals)
  } else {
    terminalController = createTerminalPanelController({
      port: connection.terminals,
      createPanel: createTerminalPanel,
      createConnector: createTerminalConnector,
      labelLayer: cubitoScene.labelLayer,
      hud: hudElement,
      dispatch: (action) => store.dispatchTerminal(action),
      nodeCenter: (id) => graphView.nodeCenter(id),
      projectToNdc: projectWorldToNdc,
      viewport: () => viewportSize
    })
    terminalController.sync(store.get().terminals)
  }
  store.dispatchTerminal({ type: 'connection-regained' })
}

const pairingEntry = decidePairingEntry(consumePairingFragment())
if (pairingEntry.kind === 'connect') {
  createLiveWorktreeSync({
    connect: () => connectOrcad(pairingEntry.offer),
    store,
    isDocumentHidden: () => document.hidden,
    onVisibilityChange: (cb) => {
      document.addEventListener('visibilitychange', cb)
      return () => document.removeEventListener('visibilitychange', cb)
    },
    onConnected: bindTerminals,
    onDisconnected: () => store.dispatchTerminal({ type: 'connection-lost' })
  }).start()
} else {
  store.update({ connection: { state: 'down', reason: pairingEntry.reason } })
  void syncWorktreeGraph(demoGateway, store) // `pnpm dev` stays usable with no container
}
