/**
 * Orchestrates one orcad connection: paired transport -> RpcConnection -> orcad-gateway,
 * shaped to satisfy `live-worktree-sync.ts`'s `LiveSyncDeps.connect` structurally (kept
 * self-contained here rather than importing that application module — CO-112 adjacent).
 * Keypair/sharedKey/deviceToken never touch module state, only this function's closures.
 */
import {
  connectPairedTransport,
  PairingConnectionError,
  type PairedTransport
} from './paired-websocket-transport'
import { RpcConnection } from './rpc-connection'
import { createOrcadGateway } from './orcad-gateway'
import { TerminalMultiplexClient } from './terminal-multiplex-client'
import { createSystemGraphStreamPort } from './orcad-system-watch-gateway'
import type { PairingOffer } from './pairing-offer'
import type { RuntimeGateway } from '../../application/ports/runtime-gateway'
import type { TerminalStreamPort } from '../../application/ports/terminal-stream-port'
import type { SystemGraphStreamPort } from '../../application/ports/system-graph-stream-port'

const DEFAULT_TIMEOUT_MS = 30_000

export type ConnectOrcadOptions = { timeoutMs?: number }

/**
 * Design-gap resolution, option (a) (pinned in tasks P5.6/P6.2): `runtimeId` starts unset and
 * is populated in place once the gateway's first successful call reports `_meta.runtimeId` —
 * `live-worktree-sync` reads it off this same object reference right after that call settles.
 */
export type OrcadConnection = {
  gateway: RuntimeGateway
  terminals: TerminalStreamPort
  systemGraphStream: SystemGraphStreamPort
  runtimeId?: string
  /** Host-negotiated capability ids, read once via `status.get` at connect time (Change B). */
  capabilities: readonly string[]
  close(): void
  onClose(cb: (reason: string) => void): void
}

export async function connectOrcad(
  offer: PairingOffer,
  options: ConnectOrcadOptions = {}
): Promise<OrcadConnection> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const transport = await connectWithTimeout(offer, timeoutMs)
  const rpcConnection = new RpcConnection(transport, { deviceToken: offer.deviceToken, timeoutMs })
  const terminals = await openTerminalsPort(rpcConnection)
  const capabilities = await fetchCapabilities(rpcConnection)

  const connection: OrcadConnection = {
    gateway: createOrcadGateway(
      { call: (method, params) => rpcConnection.call(method, params) },
      {
        onRuntimeId: (runtimeId) => {
          connection.runtimeId = runtimeId
        }
      }
    ),
    terminals,
    systemGraphStream: createSystemGraphStreamPort(rpcConnection),
    capabilities,
    close: () => transport.close(),
    // The transport only surfaces a human close reason, never a stable code — every
    // socket-level loss is reported as `connection_closed` so `reconnect-backoff`/
    // `connection-reason` (both keyed on the fixed failure-code vocabulary) classify it
    // consistently, whatever text the underlying close reason happened to carry.
    onClose: (cb) => {
      transport.onClose(() => cb('connection_closed'))
    }
  }
  return connection
}

/** One `terminal.multiplex` channel per connection (design Area 4/5/7) — opened eagerly so the
 * returned port's `subscribe`/`sendInput`/etc. can fire-and-forget once the connection is live. */
async function openTerminalsPort(rpcConnection: RpcConnection): Promise<TerminalStreamPort> {
  const client = new TerminalMultiplexClient(rpcConnection)
  await client.open()
  return {
    async createTerminal(worktree) {
      // orcad returns { terminal: { handle, tabId, paneKey, ... } }; the multiplex Subscribe frame
      // wants only the handle STRING (stream-schemas.ts TerminalHandle) — pass that, not the object.
      const response = await rpcConnection.call<{ terminal: { handle: string } }>(
        'terminal.create',
        {
          worktree
        }
      )
      return { terminal: response.result.terminal.handle }
    },
    subscribe: (streamId, terminal, viewport, sink) =>
      client.subscribe(streamId, terminal, viewport, sink),
    sendInput: (streamId, text) => client.sendInput(streamId, text),
    sendResize: (streamId, cols, rows) => client.sendResize(streamId, cols, rows),
    unsubscribe: (streamId) => client.unsubscribe(streamId),
    close: async (terminal) => {
      await rpcConnection.call('terminal.close', { terminal })
    }
  }
}

/** Reads the host's negotiated capability list once per connect; an unreachable/old host
 *  (no `status.get`, or one that rejects it) is treated as capability-less, never fatal. */
async function fetchCapabilities(rpcConnection: RpcConnection): Promise<readonly string[]> {
  try {
    const response = await rpcConnection.call<{ capabilities?: unknown }>('status.get')
    return Array.isArray(response.result.capabilities)
      ? (response.result.capabilities as string[])
      : []
  } catch {
    return []
  }
}

/** `connectPairedTransport` has no internal timer (D1) — the caller applies one (CO-108). */
async function connectWithTimeout(
  offer: PairingOffer,
  timeoutMs: number
): Promise<PairedTransport> {
  let timedOut = false
  let timeoutHandle: ReturnType<typeof setTimeout>
  const timeout = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      timedOut = true
      reject(
        new PairingConnectionError(
          'remote_runtime_unavailable',
          `No handshake response within ${timeoutMs}ms.`,
          'connect'
        )
      )
    }, timeoutMs)
  })
  const transportPromise = connectPairedTransport(offer)
  // A transport that resolves only after the timeout already rejected must still be closed.
  transportPromise.then(
    (transport) => {
      if (timedOut) transport.close()
    },
    () => {}
  )
  try {
    return await Promise.race([transportPromise, timeout])
  } finally {
    clearTimeout(timeoutHandle!)
  }
}
