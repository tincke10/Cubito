/**
 * Real transport implementing `RpcTransport` over Node/browser's global `WebSocket`.
 * Single-shot (one connect, one close) — reconnect/backoff sequencing belongs to the
 * application layer (`reconnect-backoff.ts` + `live-worktree-sync.ts`), not here.
 *
 * Text vs binary is discriminated via `typeof event.data === 'string'`. `binaryType` is
 * pinned to 'arraybuffer' at socket creation so inbound binary is always synchronously
 * readable (Blob, the other default, requires an async read).
 */
import {
  createPairingHandshake,
  type HandshakeEffect,
  type HandshakeFailure,
  type PairingStage
} from './pairing-handshake'
import type { PairingOffer } from './pairing-offer'
import type { RpcTransport } from './rpc-connection'

export type WebSocketLike = {
  send(data: string | ArrayBufferLike | Uint8Array): void
  close(code?: number, reason?: string): void
  addEventListener(type: 'open' | 'message' | 'close' | 'error', cb: (event: any) => void): void
}

export type PairedTransport = RpcTransport & { close(): void }

export type PairedTransportDeps = {
  createSocket?: (url: string) => WebSocketLike
}

export class PairingConnectionError extends Error {
  readonly code: string
  readonly stage: PairingStage
  readonly closeCode?: number

  constructor(code: string, message: string, stage: PairingStage, closeCode?: number) {
    super(message)
    this.name = 'PairingConnectionError'
    this.code = code
    this.stage = stage
    if (closeCode !== undefined) {
      this.closeCode = closeCode
    }
  }
}

const defaultCreateSocket = (url: string): WebSocketLike => {
  const socket = new WebSocket(url)
  // Browsers default to 'blob' (async); pin 'arraybuffer' so inbound binary is sync-readable.
  socket.binaryType = 'arraybuffer'
  return socket as unknown as WebSocketLike
}

export function connectPairedTransport(
  offer: PairingOffer,
  deps: PairedTransportDeps = {}
): Promise<PairedTransport> {
  const createSocket = deps.createSocket ?? defaultCreateSocket
  const handshake = createPairingHandshake({
    deviceToken: offer.deviceToken,
    serverPublicKeyB64: offer.publicKeyB64
  })

  return new Promise((resolve, reject) => {
    const socket = createSocket(offer.endpoint)
    const messageHandlers = new Set<(data: string) => void>()
    const binaryHandlers = new Set<(bytes: Uint8Array) => void>()
    const closeHandlers = new Set<(reason?: string) => void>()
    let settled = false
    let closed = false

    function fireClose(reason?: string): void {
      if (closed) {
        return
      }
      closed = true
      for (const cb of [...closeHandlers]) cb(reason)
    }

    function handleFailure(failure: HandshakeFailure): void {
      if (!settled) {
        settled = true
        reject(
          new PairingConnectionError(
            failure.code,
            failure.message,
            failure.stage,
            failure.closeCode
          )
        )
      } else {
        fireClose(failure.message)
      }
      socket.close()
    }

    function applyEffects(effects: readonly HandshakeEffect[]): void {
      for (const effect of effects) {
        if (effect.kind === 'send') {
          socket.send(effect.frame)
        } else if (effect.kind === 'ready') {
          settled = true
          resolve({
            send(data: string) {
              socket.send(handshake.sealRequest(data))
            },
            sendBinary(bytes: Uint8Array) {
              socket.send(handshake.sealBinary(bytes))
            },
            onMessage(cb) {
              messageHandlers.add(cb)
              return () => messageHandlers.delete(cb)
            },
            onBinary(cb) {
              binaryHandlers.add(cb)
              return () => binaryHandlers.delete(cb)
            },
            onClose(cb) {
              closeHandlers.add(cb)
              return () => closeHandlers.delete(cb)
            },
            close() {
              fireClose()
              socket.close()
            }
          })
        } else if (effect.kind === 'deliver') {
          for (const cb of [...messageHandlers]) cb(effect.plaintext)
        } else if (effect.kind === 'deliver-binary') {
          for (const cb of [...binaryHandlers]) cb(effect.bytes)
        } else {
          handleFailure(effect.failure)
        }
      }
    }

    socket.addEventListener('open', () => {
      applyEffects(handshake.start())
    })
    socket.addEventListener('message', (event: { data: unknown }) => {
      if (typeof event.data === 'string') {
        applyEffects(handshake.onTextFrame(event.data))
      } else {
        applyEffects(handshake.onBinaryFrame(new Uint8Array(event.data as ArrayBufferLike)))
      }
    })
    socket.addEventListener('close', (event: { code: number; reason: string }) => {
      applyEffects(handshake.onClose(event.code, event.reason))
    })
    socket.addEventListener('error', () => {
      // The close event (or a handshake failure already in flight) drives rejection/close.
    })
  })
}
