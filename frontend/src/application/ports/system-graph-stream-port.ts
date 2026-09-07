import type { SystemGraphSnapshot } from './runtime-gateway'

/** Frames the stream port surfaces to a caller — structurally matches infrastructure's
 *  `system.watch` wire frames (system-graph-wire.ts), minus the transport-only `starting`/`end`
 *  bookkeeping, which the adapter absorbs. */
export type SystemGraphStreamFrame =
  | { type: 'ready'; subscriptionId: string; snapshot: SystemGraphSnapshot }
  | { type: 'graph'; snapshot: SystemGraphSnapshot }

export type SystemGraphStreamHandlers = {
  onFrame(frame: SystemGraphStreamFrame): void
  /** `method_not_found` — old host, no `system.watch`. Fires at most once. */
  onUnsupported(): void
  /** An `error`/`end` frame, any other RPC failure, or the transport closing. */
  onClosed(): void
}

/**
 * Port to the orcad `system.watch` stream — rides its own port like `TerminalStreamPort` on
 * `OrcadConnection`, not a `RuntimeGateway` method (streaming RPCs don't fit that unary shape).
 */
export type SystemGraphStreamPort = {
  watch(worktree: string, handlers: SystemGraphStreamHandlers): { close(): void }
}
