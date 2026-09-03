import { decodeRpcFrame, encodeRpcRequest } from './envelope'
import type { RpcSuccessFrame } from './envelope'

/**
 * Transport abstraction so the connection logic stays independent of how
 * frames travel: a browser WebSocket, a local bridge, or a test fake.
 */
export type RpcTransport = {
  send(data: string): void
  onMessage(cb: (data: string) => void): () => void
  onClose(cb: (reason?: string) => void): () => void
  sendBinary?(bytes: Uint8Array): void
  onBinary?(cb: (bytes: Uint8Array) => void): () => void
}

export class RpcCallError extends Error {
  readonly code: string
  readonly data: unknown

  constructor(code: string, message: string, data?: unknown) {
    super(message)
    this.name = 'RpcCallError'
    this.code = code
    this.data = data
  }
}

type PendingCall = {
  resolve(response: RpcSuccessFrame): void
  reject(error: RpcCallError): void
  timer: ReturnType<typeof setTimeout>
  method: string
}

export type StreamHandlers = {
  onEmit(result: unknown): void
  onError(error: RpcCallError): void
  onClose(): void
}

export type OpenRpcStream = { close(): void }

export type RpcConnectionOptions = {
  deviceToken: string
  timeoutMs?: number
  generateId?: () => string
}

const DEFAULT_TIMEOUT_MS = 30_000

/**
 * Multiplexes RPC calls over one transport, correlating responses by id.
 * Keepalives and responses to unknown ids are ignored by contract.
 */
export class RpcConnection {
  private readonly transport: RpcTransport
  private readonly deviceToken: string
  private readonly timeoutMs: number
  private readonly generateId: () => string
  private readonly pending = new Map<string, PendingCall>()
  // Long-lived streaming RPCs (terminal.multiplex): kept out of `pending` so they are never
  // touched by the request timeout or resolved/deleted after their first emit.
  private readonly streams = new Map<string, StreamHandlers>()

  constructor(transport: RpcTransport, options: RpcConnectionOptions) {
    this.transport = transport
    this.deviceToken = options.deviceToken
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
    this.generateId = options.generateId ?? (() => crypto.randomUUID())
    transport.onMessage((raw) => this.handleFrame(raw))
    transport.onClose(() => this.rejectAll('connection_closed', 'The runtime connection closed.'))
  }

  call<TResult = unknown>(
    method: string,
    params?: unknown
  ): Promise<RpcSuccessFrame & { result: TResult }> {
    const id = this.generateId()
    return new Promise((resolve, reject) => {
      this.pending.set(id, {
        resolve: (response) => resolve(response as RpcSuccessFrame & { result: TResult }),
        reject,
        timer: this.startTimeoutTimer(id, method, reject),
        method
      })
      const request: Parameters<typeof encodeRpcRequest>[0] = {
        id,
        deviceToken: this.deviceToken,
        method
      }
      if (params !== undefined) {
        request.params = params
      }
      this.transport.send(encodeRpcRequest(request))
    })
  }

  /** Opens a long-lived streaming RPC (e.g. terminal.multiplex). Not timeout-bounded. */
  openStream(method: string, params: unknown, handlers: StreamHandlers): OpenRpcStream {
    const id = this.generateId()
    this.streams.set(id, handlers)
    const request: Parameters<typeof encodeRpcRequest>[0] = {
      id,
      deviceToken: this.deviceToken,
      method
    }
    if (params !== undefined) {
      request.params = params
    }
    this.transport.send(encodeRpcRequest(request))
    return {
      close: () => {
        this.streams.delete(id)
      }
    }
  }

  /** Out-of-band binary frames (no rpc id) — passthrough to the transport. */
  sendBinary(bytes: Uint8Array): void {
    this.transport.sendBinary?.(bytes)
  }

  onBinary(cb: (bytes: Uint8Array) => void): () => void {
    return this.transport.onBinary?.(cb) ?? (() => {})
  }

  private startTimeoutTimer(
    id: string,
    method: string,
    reject: (error: RpcCallError) => void
  ): ReturnType<typeof setTimeout> {
    return setTimeout(() => {
      this.pending.delete(id)
      reject(
        new RpcCallError('rpc_timeout', `No response for ${method} within ${this.timeoutMs}ms.`)
      )
    }, this.timeoutMs)
  }

  private handleFrame(raw: string): void {
    const frame = decodeRpcFrame(raw)
    if (frame.kind === 'keepalive') {
      this.refreshPendingTimeouts()
      return
    }
    if (frame.kind === 'stream') {
      this.streams.get(frame.response.id)?.onEmit(frame.response.result)
      return
    }
    if (frame.kind !== 'response') {
      return
    }
    const stream = this.streams.get(frame.response.id)
    if (stream) {
      // A streaming RPC only ever replies with a failure while alive (never a final success).
      if (!frame.response.ok) {
        const { code, message, data } = frame.response.error
        stream.onError(new RpcCallError(code, message, data))
      }
      return
    }
    const pending = this.pending.get(frame.response.id)
    if (!pending) {
      return
    }
    this.pending.delete(frame.response.id)
    clearTimeout(pending.timer)
    if (frame.response.ok) {
      pending.resolve(frame.response)
    } else {
      const { code, message, data } = frame.response.error
      pending.reject(new RpcCallError(code, message, data))
    }
  }

  // CO-206 regression: a keepalive refreshes EVERY pending call's timer, not just the newest —
  // browser setTimeout handles have no .refresh(), so each timer is cleared and re-armed.
  private refreshPendingTimeouts(): void {
    for (const [id, pending] of this.pending.entries()) {
      clearTimeout(pending.timer)
      pending.timer = this.startTimeoutTimer(id, pending.method, pending.reject)
    }
  }

  private rejectAll(code: string, message: string): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer)
      pending.reject(new RpcCallError(code, message))
    }
    this.pending.clear()
    for (const stream of this.streams.values()) {
      stream.onClose()
    }
    this.streams.clear()
  }
}
