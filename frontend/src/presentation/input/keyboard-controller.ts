import type { SceneStore } from '../../application/scene-store'
import type { WorktreeId } from '../../domain/worktree-graph/types'
import { isTextEntryTarget, resolveNavCommand } from '../navigation/keymap'
import { moveSelection } from '../navigation/selection-model'
import { frameAll, frameIsland, frameNode, isWithinFraming } from '../camera/camera-framing'
import type { CameraFraming, Vec3 } from '../camera/camera-framing'
import { nextIsland } from '../../application/repos-model'
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
  /** Mac vs. Linux/Windows — selects the ⌘P/Ctrl+P chord (PROJ-005). */
  platform: { isMac: boolean }
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
  const { store, cameraRig, scenePositions, terminal, platform } = deps
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
    const command = resolveNavCommand(
      event.key,
      { alt: event.altKey, ctrl: event.ctrlKey, meta: event.metaKey, shift: event.shiftKey },
      platform
    )
    // ⌘P/Ctrl+P must open the selector even while a terminal (a text-entry target) is focused
    // (PROJ-008) — checked before the text-entry gate below, unlike every other command.
    if (command?.kind === 'open-projects') {
      store.dispatchProjectSelector({ type: 'open' })
      return true
    }
    if (event.target && isTextEntryTarget(event.target.tagName, event.target.isContentEditable)) {
      // Covers xterm.js's hidden helper textarea too (TEXT_ENTRY_TAGS includes TEXTAREA) — while
      // a terminal is focused, every other keystroke (incl. Esc) reaches the PTY, never the graph.
      return false
    }
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
      // Tab precedence (PROJ-008): modal > terminal > island. The selector's own query input is
      // a text-entry target already caught above; this is belt-and-suspenders for any other case.
      if (store.get().projectSelector.view !== 'closed') return true
      const activePanel = store.get().terminals.activePanel
      if (activePanel) {
        store.dispatchTerminal({ type: 'next-tab', nodeId: activePanel.nodeId })
        return true
      }
      const repos = store.get().repos
      const next = nextIsland(repos.list, repos.activeRepoId)
      if (next === null) return false
      store.dispatchRepos({ type: 'set-active', repoId: next })
      focusFraming(frameIsland(store.get().graph, next, scenePositions.nodeCenter))
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
    // command.kind === 'escape' — selector-close wins over spawn/terminal-close (PROJ-008); the
    // selector's own query/path input already intercepts Escape above, this is belt-and-suspenders.
    if (store.get().projectSelector.view !== 'closed') {
      store.dispatchProjectSelector({ type: 'close' })
      return true
    }
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
      // Tab's default browser behavior (focus traversal) would otherwise fight next-terminal;
      // Ctrl+P/Cmd+P would otherwise open the browser's print dialog (PROJ-005).
      const isPrintChord = (domEvent.ctrlKey || domEvent.metaKey) && domEvent.key === 'p'
      if (handled && (domEvent.key === 'Tab' || isPrintChord)) {
        domEvent.preventDefault()
      }
    }
    target.addEventListener('keydown', onKeyDown)
    return () => target.removeEventListener('keydown', onKeyDown)
  }

  return { handleKeyDown, attach }
}
