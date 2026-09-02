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

export type KeyboardControllerDeps = {
  store: SceneStore
  cameraRig: CameraRigLike
  scenePositions: ScenePositions
}

export type KeyboardController = {
  handleKeyDown(event: KeyboardControllerEvent): void
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
  const { store, cameraRig, scenePositions } = deps
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

  const handleKeyDown = (event: KeyboardControllerEvent): void => {
    if (event.target && isTextEntryTarget(event.target.tagName, event.target.isContentEditable)) {
      return
    }
    const command = resolveNavCommand(event.key, {
      alt: event.altKey,
      ctrl: event.ctrlKey,
      meta: event.metaKey,
      shift: event.shiftKey
    })
    if (!command) {
      return
    }
    if (command.kind === 'move') {
      const graph = store.get().graph
      const current = store.get().selection.selectedId
      const next = moveSelection(graph, current, command.direction)
      if (next !== current) {
        store.update({ selection: { selectedId: next } })
      }
      if (next !== null) {
        guardSelectionInView(next)
      }
      return
    }
    if (command.kind === 'focus') {
      const selectedId = store.get().selection.selectedId
      const center = selectedId !== null ? scenePositions.nodeCenter(selectedId) : null
      if (center) {
        focusFraming(frameNode(center))
      }
      return
    }
    focusFraming(frameAll(scenePositions.nodeCenters()))
  }

  const attach = (target: DomKeydownTarget): (() => void) => {
    const onKeyDown = (domEvent: KeyboardEvent): void => {
      const element = domEvent.target instanceof HTMLElement ? domEvent.target : null
      handleKeyDown({
        key: domEvent.key,
        altKey: domEvent.altKey,
        ctrlKey: domEvent.ctrlKey,
        metaKey: domEvent.metaKey,
        shiftKey: domEvent.shiftKey,
        target: element ? { tagName: element.tagName, isContentEditable: element.isContentEditable } : null
      })
    }
    target.addEventListener('keydown', onKeyDown)
    return () => target.removeEventListener('keydown', onKeyDown)
  }

  return { handleKeyDown, attach }
}
