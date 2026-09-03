import type { RpcCallError, RpcConnection } from './rpc-connection'
import {
  TerminalStreamOpcode,
  decodeTerminalStreamFrame,
  decodeTerminalStreamJson,
  decodeTerminalStreamText,
  encodeTerminalStreamFrame,
  encodeTerminalStreamJson,
  encodeTerminalStreamText
} from './terminal-stream-codec'

/** Per-stream callbacks the driver dispatches decoded frames/emits to. MVP: no capabilities
 * advertised, so Ack/source-ranges/pause never fire — callers only ever see this surface. */
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

export type TerminalMultiplexClientOptions = {
  /** Advertised in every Subscribe as `client.id` — drives server-side tab mount + Resize gating. */
  clientId?: string
}

const CONTROL_STREAM_ID = 0

/**
 * Protocol driver for one orcad `terminal.multiplex` streaming RPC: owns the control channel
 * (Subscribe on streamId 0) and routes binary out-of-band frames to per-stream sinks. Mirrors
 * `src/main/runtime/rpc/methods/terminal/*` behavior from the client side (rpc-purity: no
 * src/shared import — see terminal-stream-codec.ts for the wire mirror).
 */
export class TerminalMultiplexClient {
  private readonly connection: RpcConnection
  private readonly clientId: string
  private readonly sinks = new Map<number, TerminalStreamSink>()
  private stream: { close(): void } | null = null
  private unbindBinary: (() => void) | null = null
  private readonly closeHandlers = new Set<() => void>()

  constructor(connection: RpcConnection, options: TerminalMultiplexClientOptions = {}) {
    this.connection = connection
    this.clientId = options.clientId ?? crypto.randomUUID()
  }

  /** Opens the multiplex RPC and resolves once the server confirms `{type:'ready'}`. */
  open(): Promise<void> {
    return new Promise((resolve, reject) => {
      let ready = false
      this.stream = this.connection.openStream(
        'terminal.multiplex',
        {},
        {
          onEmit: (result) => {
            if (!ready && isEmit(result, 'ready')) {
              ready = true
              resolve()
              return
            }
            this.handleEmit(result)
          },
          onError: (error: RpcCallError) => {
            if (!ready) {
              reject(error)
              return
            }
            this.handleMultiplexClosed()
          },
          onClose: () => {
            if (!ready) {
              reject(new Error('terminal.multiplex closed before ready'))
              return
            }
            this.handleMultiplexClosed()
          }
        }
      )
      this.unbindBinary = this.connection.onBinary((bytes) => this.dispatchBinary(bytes))
    })
  }

  /** Notified once when the underlying multiplex RPC ends (server or transport). */
  onClose(cb: () => void): () => void {
    this.closeHandlers.add(cb)
    return () => this.closeHandlers.delete(cb)
  }

  subscribe(
    streamId: number,
    terminal: string,
    viewport: TerminalViewport | undefined,
    sink: TerminalStreamSink
  ): void {
    this.sinks.set(streamId, sink)
    const payload = encodeTerminalStreamJson({
      terminal,
      streamId,
      client: { id: this.clientId, type: 'desktop' },
      viewport,
      capabilities: {}
    })
    this.sendFrame(TerminalStreamOpcode.Subscribe, CONTROL_STREAM_ID, payload)
  }

  sendInput(streamId: number, text: string): void {
    if (text.length === 0) {
      return
    }
    this.sendFrame(TerminalStreamOpcode.Input, streamId, encodeTerminalStreamText(text))
  }

  sendResize(streamId: number, cols: number, rows: number): void {
    this.sendFrame(TerminalStreamOpcode.Resize, streamId, encodeTerminalStreamJson({ cols, rows }))
  }

  unsubscribe(streamId: number): void {
    this.sendFrame(TerminalStreamOpcode.Unsubscribe, streamId, new Uint8Array(0))
    this.sinks.delete(streamId)
  }

  close(): void {
    this.unbindBinary?.()
    this.stream?.close()
    this.sinks.clear()
  }

  private sendFrame(opcode: TerminalStreamOpcode, streamId: number, payload: Uint8Array): void {
    this.connection.sendBinary(encodeTerminalStreamFrame({ opcode, streamId, seq: 0, payload }))
  }

  private handleEmit(result: unknown): void {
    if (!isRecord(result) || typeof result.type !== 'string') {
      return
    }
    switch (result.type) {
      case 'subscribed': {
        const streamId = result.streamId
        if (typeof streamId !== 'number') return
        this.sinks.get(streamId)?.onSubscribed({
          streamId,
          terminal: typeof result.terminal === 'string' ? result.terminal : '',
          cols: typeof result.cols === 'number' ? result.cols : 0,
          rows: typeof result.rows === 'number' ? result.rows : 0
        })
        return
      }
      case 'end': {
        const streamId = result.streamId
        if (typeof streamId !== 'number') return
        this.sinks.get(streamId)?.onEnd()
        this.sinks.delete(streamId)
        return
      }
      case 'error': {
        const streamId = result.streamId
        if (typeof streamId !== 'number') return
        const message = typeof result.message === 'string' ? result.message : 'terminal_error'
        this.sinks.get(streamId)?.onError(message)
        return
      }
      default:
        // fit-override-changed / driver-changed / future additive types: ignore (MVP).
        return
    }
  }

  private dispatchBinary(bytes: Uint8Array): void {
    const frame = decodeTerminalStreamFrame(bytes)
    if (!frame) {
      return
    }
    const sink = this.sinks.get(frame.streamId)
    if (!sink) {
      return
    }
    switch (frame.opcode) {
      case TerminalStreamOpcode.Output:
      case TerminalStreamOpcode.SnapshotChunk:
        sink.write(frame.payload)
        return
      case TerminalStreamOpcode.OutputSpan: {
        const span = decodeTerminalStreamJson<{ data: string }>(frame.payload)
        if (span) {
          sink.write(encodeTerminalStreamText(span.data))
        }
        return
      }
      case TerminalStreamOpcode.SnapshotStart: {
        const meta = decodeTerminalStreamJson<Record<string, unknown>>(frame.payload)
        if (meta) {
          sink.onSnapshotStart(meta)
        }
        return
      }
      case TerminalStreamOpcode.SnapshotEnd:
        sink.onSnapshotEnd()
        return
      case TerminalStreamOpcode.Resized: {
        const resized = decodeTerminalStreamJson<{ cols: number; rows: number }>(frame.payload)
        if (resized) {
          sink.onResize(resized.cols, resized.rows)
        }
        return
      }
      case TerminalStreamOpcode.Error:
        sink.onError(decodeTerminalStreamText(frame.payload))
        return
      // Metadata/WriteUnavailable: MVP advertises no capabilities, so these never fire — ignore
      // if a newer host sends them anyway. Any other opcode: dropped by decodeTerminalStreamFrame.
      default:
        return
    }
  }

  private handleMultiplexClosed(): void {
    for (const sink of this.sinks.values()) {
      sink.onEnd()
    }
    this.sinks.clear()
    this.unbindBinary?.()
    this.unbindBinary = null
    for (const cb of this.closeHandlers) {
      cb()
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isEmit(result: unknown, type: string): boolean {
  return isRecord(result) && result.type === type
}
