import type { WorktreeId } from '../../domain/worktree-graph/types'

/** Per-stream callbacks the port dispatches decoded terminal frames to — structurally matches
 * infrastructure's `TerminalStreamSink` (terminal-multiplex-client.ts) so no import is needed. */
export type TerminalStreamSink = {
  onSubscribed(meta: { streamId: number; terminal: string; cols: number; rows: number }): void
  onSnapshotStart(meta: Record<string, unknown>): void
  write(bytes: Uint8Array): void
  onSnapshotEnd(): void
  onResize(cols: number, rows: number): void
  onError(message: string): void
  onEnd(): void
}

export type TerminalViewport = { cols: number; rows: number }

/**
 * Port to the orcad terminal.multiplex stream. The application layer (terminal-session-model +
 * scene-store) depends on this shape only; infrastructure's `TerminalMultiplexClient` (plus the
 * terminal.create/terminal.close RPC calls) satisfies it structurally, like runtime-gateway.ts.
 */
export type TerminalStreamPort = {
  createTerminal(worktree: WorktreeId): Promise<{ terminal: string }>
  subscribe(
    streamId: number,
    terminal: string,
    viewport: TerminalViewport | undefined,
    sink: TerminalStreamSink
  ): void
  sendInput(streamId: number, text: string): void
  sendResize(streamId: number, cols: number, rows: number): void
  unsubscribe(streamId: number): void
  close(terminal: string): Promise<void>
}
