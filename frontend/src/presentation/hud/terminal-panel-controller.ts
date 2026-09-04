import type { Vec3 } from '../camera/camera-framing'
import type { WorktreeId } from '../../domain/worktree-graph/types'
import type {
  TerminalAction,
  TerminalPlacement,
  TerminalsState
} from '../../application/terminal-session-model'
import type {
  TerminalStreamPort,
  TerminalStreamSink
} from '../../application/ports/terminal-stream-port'
import type { TerminalPanelHandle } from './terminal-panel-element'
import type { TerminalConnectorHandle } from './terminal-connector-element'
import { terminalPanelModel } from './terminal-panel-model'
import type { NdcPoint } from './terminal-connector-projector'
import { projectToScreen } from './terminal-connector-projector'

/** World-space lift above the node center the panel floats at (mirrors node-label's fixed offset). */
const PANEL_WORLD_LIFT = 3

export type TerminalPanelControllerDeps = {
  port: TerminalStreamPort
  /** `onExit` fires on the panel's Ctrl+] chord (see terminal-panel-element.ts). */
  createPanel: (onExit: () => void) => TerminalPanelHandle
  createConnector: () => TerminalConnectorHandle
  labelLayer: { add(object: unknown): void; remove(object: unknown): void }
  hud: { appendChild(element: unknown): void }
  dispatch: (action: TerminalAction) => void
  nodeCenter: (nodeId: WorktreeId) => Vec3 | null
  /** Wraps the impure THREE camera projection so tests can supply a fixed NDC point. */
  projectToNdc: (world: Vec3) => NdcPoint
  viewport: () => { width: number; height: number }
}

export type TerminalPanelController = {
  sync(state: TerminalsState): void
  tick(): void
  /** Gives the currently mounted panel's xterm real DOM focus (`[t]`/reopen). */
  focusActivePanel(): void
  /** Blurs the mounted panel and dispatches `set-focused:false` — the exit chord/click-away path. */
  exitFocus(): void
  /** Unsubscribes + closes the mounted session on the port, then dispatches `close-terminal`. */
  closeActiveSession(): void
  /** Reconnect (design Area 7): swaps the port and, if a session is mounted, re-creates +
   *  re-subscribes it on the fresh connection without recreating the xterm/DOM panel. */
  rebind(port: TerminalStreamPort): void
  dispose(): void
}

type Mounted = {
  nodeId: WorktreeId
  streamId: number
  placement: TerminalPlacement
  panel: TerminalPanelHandle
  unsubscribeData: () => void
  unsubscribeResize: () => void
  dispatchedOutput: boolean
  /** Known once `terminal.create`/`onSubscribed` resolve — lets a later re-mount (tab switch,
   *  revisiting a node) skip `createTerminal` and just resubscribe the existing PTY handle. */
  handle: string | null
}

/**
 * Owns xterm lifecycle for the single active panel (design Area 6): mounts/unmounts on
 * activePanel changes, pipes port bytes directly to xterm (never through the store), wires
 * xterm input/resize back to the port, and positions the CSS2DObject + dashed connector.
 */
export function createTerminalPanelController(
  deps: TerminalPanelControllerDeps
): TerminalPanelController {
  const connector = deps.createConnector()
  let port = deps.port
  let mounted: Mounted | null = null

  const attach = (panel: TerminalPanelHandle, placement: TerminalPlacement): void => {
    if (placement === 'scene') deps.labelLayer.add(panel.object)
    else deps.hud.appendChild(panel.element)
  }

  const detach = (panel: TerminalPanelHandle, placement: TerminalPlacement): void => {
    if (placement === 'scene') deps.labelLayer.remove(panel.object)
  }

  const unmount = (): void => {
    if (!mounted) return
    detach(mounted.panel, mounted.placement)
    port.unsubscribe(mounted.streamId)
    mounted.unsubscribeData()
    mounted.unsubscribeResize()
    mounted.panel.dispose()
    mounted = null
  }

  const sinkFor = (entry: Mounted): TerminalStreamSink => ({
    onSubscribed: (meta) => {
      entry.handle = meta.terminal
      deps.dispatch({
        type: 'subscribed',
        streamId: meta.streamId,
        terminal: meta.terminal,
        cols: meta.cols,
        rows: meta.rows
      })
    },
    onSnapshotStart: () => entry.panel.reset(),
    write: (bytes) => {
      entry.panel.write(bytes)
      if (!entry.dispatchedOutput) {
        entry.dispatchedOutput = true
        deps.dispatch({ type: 'output-arrived', streamId: entry.streamId })
      }
    },
    onSnapshotEnd: () => {},
    onResize: () => entry.panel.fit(),
    onError: () => {},
    onEnd: () => {}
  })

  const exitFocus = (): void => {
    mounted?.panel.blur()
    deps.dispatch({ type: 'set-focused', focused: false })
  }

  const mount = (
    nodeId: WorktreeId,
    streamId: number,
    placement: TerminalPlacement,
    cachedHandle: string | null
  ): void => {
    const panel = deps.createPanel(() => exitFocus())
    const unsubscribeData = panel.onData((data) => port.sendInput(streamId, data))
    const unsubscribeResize = panel.onResize((cols, rows) => port.sendResize(streamId, cols, rows))
    attach(panel, placement)
    const entry: Mounted = {
      nodeId,
      streamId,
      placement,
      panel,
      unsubscribeData,
      unsubscribeResize,
      dispatchedOutput: false,
      handle: cachedHandle
    }
    mounted = entry
    if (cachedHandle) {
      // Already created+subscribed once on this connection (tab switch / revisited node) — no
      // need to allocate a new PTY, just resubscribe; the server replays a fresh snapshot.
      port.subscribe(streamId, cachedHandle, undefined, sinkFor(entry))
      return
    }
    void port.createTerminal(nodeId).then(({ terminal }) => {
      if (mounted !== entry) return // superseded while the create RPC was in flight
      entry.handle = terminal
      port.subscribe(streamId, terminal, undefined, sinkFor(entry))
    })
  }

  return {
    sync(state: TerminalsState): void {
      const model = terminalPanelModel(state)
      if (!model) {
        unmount()
        return
      }
      const tabs = state.byNode.get(model.nodeId) ?? []
      const streamId = tabs[model.activeTabIndex]
      if (streamId === undefined) {
        unmount()
        return
      }

      if (!mounted || mounted.streamId !== streamId) {
        unmount()
        mount(model.nodeId, streamId, model.placement, state.sessions.get(streamId)?.handle ?? null)
      } else if (mounted.placement !== model.placement) {
        detach(mounted.panel, mounted.placement)
        attach(mounted.panel, model.placement)
        mounted.placement = model.placement
      }

      mounted!.panel.apply(model)
    },
    focusActivePanel(): void {
      mounted?.panel.focus()
    },
    exitFocus,
    closeActiveSession(): void {
      if (!mounted) return
      const { streamId, handle } = mounted
      port.unsubscribe(streamId)
      if (handle) void port.close(handle)
      deps.dispatch({ type: 'close-terminal', streamId })
    },
    rebind(newPort: TerminalStreamPort): void {
      port = newPort
      if (!mounted) return
      const entry = mounted
      entry.dispatchedOutput = false
      void port.createTerminal(entry.nodeId).then(({ terminal }) => {
        if (mounted !== entry) return
        entry.handle = terminal
        port.subscribe(entry.streamId, terminal, undefined, sinkFor(entry))
      })
    },
    tick(): void {
      if (!mounted) {
        connector.hide()
        return
      }
      const center = deps.nodeCenter(mounted.nodeId)
      if (!center) {
        connector.hide()
        return
      }
      const panelWorld: Vec3 = { x: center.x, y: center.y + PANEL_WORLD_LIFT, z: center.z }
      mounted.panel.object.position.set(panelWorld.x, panelWorld.y, panelWorld.z)

      if (mounted.placement !== 'scene') {
        connector.hide()
        return
      }
      const { width, height } = deps.viewport()
      const nodeScreen = projectToScreen(deps.projectToNdc(center), width, height)
      const panelScreen = projectToScreen(deps.projectToNdc(panelWorld), width, height)
      connector.apply(nodeScreen, panelScreen)
    },
    dispose(): void {
      unmount()
      connector.dispose()
    }
  }
}
