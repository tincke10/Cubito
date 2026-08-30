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
}

export type RpcConnectionOptions = {
  authToken: string
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
  private readonly authToken: string
  private readonly timeoutMs: number
  private readonly generateId: () => string
  private readonly pending = new Map<string, PendingCall>()

  constructor(transport: RpcTransport, options: RpcConnectionOptions) {
    this.transport = transport
    this.authToken = options.authToken
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
    this.generateId = options.generateId ?? (() => crypto.randomUUID())
    transport.onMessage((raw) => this.handleFrame(raw))
    transport.onClose(() => this.rejectAll('connection_closed', 'The runtime connection closed.'))
  }

  call<TResult = unknown>(method: string, params?: unknown): Promise<RpcSuccessFrame & { result: TResult }> {
    const id = this.generateId()
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new RpcCallError('rpc_timeout', `No response for ${method} within ${this.timeoutMs}ms.`))
      }, this.timeoutMs)
      this.pending.set(id, {
        resolve: (response) => resolve(response as RpcSuccessFrame & { result: TResult }),
        reject,
        timer
      })
      const request: Parameters<typeof encodeRpcRequest>[0] = {
        id,
        authToken: this.authToken,
        method
      }
      if (params !== undefined) {
        request.params = params
      }
      this.transport.send(encodeRpcRequest(request))
    })
  }

  private handleFrame(raw: string): void {
    const frame = decodeRpcFrame(raw)
    if (frame.kind !== 'response') {
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

  private rejectAll(code: string, message: string): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer)
      pending.reject(new RpcCallError(code, message))
    }
    this.pending.clear()
  }
}
