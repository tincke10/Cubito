import type { SceneStore } from '../../application/scene-store'
import type { WorktreeId } from '../../domain/worktree-graph/types'
import { isTextEntryTarget, resolveNavCommand } from '../navigation/keymap'
import { moveSelection } from '../navigation/selection-model'
import { frameAll, frameNode, isWithinFraming } from '../camera/camera-framing'
import type { CameraFraming, Vec3 } from '../camera/camera-framing'
import { FOCUS_DURATION_MS, NODE_SIZE } from '../theme/scene-metrics'

/** The subset of camera-rig the controller drives — never the camera/frustum directly. */
export type CameraRigLike = {
  animateTo(framing: CameraFraming, durationMs: number): void
}

/** Ground-truth node positions, supplied by whatever owns the THREE scene (graph-view). */
export type ScenePositions = {
  nodeCenter(id: WorktreeId): Vec3 | null
  nodeCenters(): Vec3[]
}

/** Framework-agnostic input — a real KeyboardEvent is structurally adapted onto this by `attach`. */
export type KeyboardControllerEvent = {
  key: string
  altKey: boolean
  ctrlKey: boolean
  metaKey: boolean
  shiftKey: boolean
  target: { tagName: string; isContentEditable: boolean } | null
}

/** The terminal-panel-controller operations the keyboard layer delegates to (design Area 8) —
 *  a narrow structural subset, like `CameraRigLike`/`ScenePositions` above. */
export type TerminalCommandPort = {
  focusActivePanel(): void
  closeActiveSession(): void
}

export type KeyboardControllerDeps = {
  store: SceneStore
  cameraRig: CameraRigLike
  scenePositions: ScenePositions
  terminal: TerminalCommandPort
}

export type KeyboardController = {
  /** Returns true when a command was resolved and acted on — `attach` uses it to decide
   *  whether to suppress the key's default browser behavior (e.g. Tab's focus traversal). */
  handleKeyDown(event: KeyboardControllerEvent): boolean
  /** Thin DOM wiring — untested logic lives only here. Returns a detach function. */
  attach(target: DomKeydownTarget): () => void
}

type DomKeydownTarget = {
  addEventListener(type: 'keydown', listener: (event: KeyboardEvent) => void): void
  removeEventListener(type: 'keydown', listener: (event: KeyboardEvent) => void): void
}

/**
 * Wires keymap + selection-model + camera-framing to the store and an injected
 * camera rig / scene-position lookup. `h/j/k/l` move the selection only; `f`/`v`
 * drive the camera. No parent/sibling/camera math lives here — it all delegates.
 */
export function createKeyboardController(deps: KeyboardControllerDeps): KeyboardController {
  const { store, cameraRig, scenePositions, terminal } = deps
  let currentFraming: CameraFraming | null = null

  const focusFraming = (framing: CameraFraming): void => {
    cameraRig.animateTo(framing, FOCUS_DURATION_MS)
    currentFraming = framing
  }

  const guardSelectionInView = (id: WorktreeId): void => {
    const center = scenePositions.nodeCenter(id)
    if (!center) {
      return
    }
    const framing = currentFraming ?? frameAll(scenePositions.nodeCenters())
    if (!isWithinFraming(center, framing, NODE_SIZE)) {
      focusFraming(frameNode(center))
    }
  }

  const handleKeyDown = (event: KeyboardControllerEvent): boolean => {
    if (event.target && isTextEntryTarget(event.target.tagName, event.target.isContentEditable)) {
      // Covers xterm.js's hidden helper textarea too (TEXT_ENTRY_TAGS includes TEXTAREA) — while
      // a terminal is focused, every keystroke (incl. Esc) reaches the PTY, never the graph.
      return false
    }
    const command = resolveNavCommand(event.key, {
      alt: event.altKey,
      ctrl: event.ctrlKey,
      meta: event.metaKey,
      shift: event.shiftKey
    })
    if (!command) {
      return false
    }
    if (command.kind === 'move') {
      // Radial open: arrow/hjkl "cycle the active chip" (SPAWN-005) — v1 ships a single
      // enabled chip, so this is a handled no-op that must not drag the graph selection
      // out from under the anchored menu.
      if (store.get().spawnMenu.view === 'radial') return true
      const graph = store.get().graph
      const current = store.get().selection.selectedId
      const next = moveSelection(graph, current, command.direction)
      if (next !== current) {
        store.update({ selection: { selectedId: next } })
      }
      if (next !== null) {
        guardSelectionInView(next)
      }
      return true
    }
    if (command.kind === 'focus') {
      const selectedId = store.get().selection.selectedId
      const center = selectedId !== null ? scenePositions.nodeCenter(selectedId) : null
      if (center) {
        focusFraming(frameNode(center))
      }
      return true
    }
    if (command.kind === 'fit-all') {
      focusFraming(frameAll(scenePositions.nodeCenters()))
      return true
    }
    if (command.kind === 'open-terminal') {
      const selectedId = store.get().selection.selectedId
      if (selectedId === null) return false
      const activePanel = store.get().terminals.activePanel
      if (activePanel?.nodeId === selectedId) {
        store.dispatchTerminal({ type: 'set-focused', focused: true })
      } else {
        store.dispatchTerminal({ type: 'open-terminal-for-node', nodeId: selectedId })
      }
      terminal.focusActivePanel()
      return true
    }
    if (command.kind === 'pin-terminal') {
      const activePanel = store.get().terminals.activePanel
      if (!activePanel) return false
      store.dispatchTerminal({
        type: 'set-placement',
        placement: activePanel.placement === 'scene' ? 'hud' : 'scene'
      })
      return true
    }
    if (command.kind === 'next-terminal') {
      const activePanel = store.get().terminals.activePanel
      if (!activePanel) return false
      store.dispatchTerminal({ type: 'next-tab', nodeId: activePanel.nodeId })
      return true
    }
    if (command.kind === 'open-spawn') {
      const spawnMenu = store.get().spawnMenu
      if (spawnMenu.view === 'radial') {
        store.dispatchSpawn({ type: 'radial-select' })
        return true
      }
      if (spawnMenu.view === 'form') return false
      const selectedId = store.get().selection.selectedId
      store.dispatchSpawn(
        selectedId !== null
          ? { type: 'open-for-node', nodeId: selectedId }
          : { type: 'open-rootless' }
      )
      return true
    }
    // command.kind === 'escape' — spawn-close wins over terminal-close (SPAWN-005 precedence)
    if (store.get().spawnMenu.view !== 'closed') {
      store.dispatchSpawn({ type: 'cancel' })
      return true
    }
    if (!store.get().terminals.activePanel) return false
    terminal.closeActiveSession()
    return true
  }

  const attach = (target: DomKeydownTarget): (() => void) => {
    const onKeyDown = (domEvent: KeyboardEvent): void => {
      const element = domEvent.target instanceof HTMLElement ? domEvent.target : null
      const handled = handleKeyDown({
        key: domEvent.key,
        altKey: domEvent.altKey,
        ctrlKey: domEvent.ctrlKey,
        metaKey: domEvent.metaKey,
        shiftKey: domEvent.shiftKey,
        target: element
          ? { tagName: element.tagName, isContentEditable: element.isContentEditable }
          : null
      })
      // Tab's default browser behavior (focus traversal) would otherwise fight next-terminal.
      if (handled && domEvent.key === 'Tab') {
        domEvent.preventDefault()
      }
    }
    target.addEventListener('keydown', onKeyDown)
    return () => target.removeEventListener('keydown', onKeyDown)
  }

  return { handleKeyDown, attach }
}
