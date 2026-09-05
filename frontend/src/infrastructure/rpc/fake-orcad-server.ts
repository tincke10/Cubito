/**
 * Test-only harness speaking the real orcad v1 handshake protocol — plaintext
 * `e2ee_hello`/`e2ee_ready` then sealed frames — over a real `ws` WebSocketServer.
 * Port of `startTestRuntime` (src/cli/runtime/websocket-transport.test.ts), but crypto
 * goes through this change's own `e2ee-box.ts`, never the engine's `src/shared`.
 *
 * Ratchet-enforced (rpc-purity.test.ts): importable only from `*.test.ts` files, so the
 * `ws` devDependency never reaches the vite bundle.
 */
import { createServer, type Server } from 'node:http'
import { WebSocketServer, type WebSocket as NodeWebSocket, type RawData } from 'ws'
import {
  decrypt,
  decryptBytes,
  deriveSharedKey,
  encrypt,
  encryptBytes,
  generateKeyPair,
  publicKeyFromBase64,
  publicKeyToBase64
} from './e2ee-box'
import {
  TerminalStreamOpcode,
  decodeTerminalStreamFrame,
  decodeTerminalStreamJson,
  decodeTerminalStreamText,
  encodeTerminalStreamFrame,
  encodeTerminalStreamJson,
  encodeTerminalStreamText,
  type TerminalStreamFrame
} from './terminal-stream-codec'

const DEFAULT_RUNTIME_ID = 'fake-orcad-runtime'
const DEFAULT_DEVICE_TOKEN = 'fake-orcad-device-token'

export type FakeOrcadRpcResponse =
  | { ok: true; result: unknown }
  | { ok: false; error: { code: string; message: string; data?: unknown } }

export type FakeOrcadHandshakeCloseStage = 'hello' | 'auth'
export type FakeOrcadBinaryFrameStage = 'ready' | 'authenticated' | 'runtime'

export type FakeOrcadServerOptions = {
  runtimeId?: string
  deviceToken?: string
  /** Reply `{type:'e2ee_error',error:{code:'unauthorized'}}` instead of authenticating. */
  rejectAuth?: boolean
  /** Send a plaintext frame that is not `{type:'e2ee_ready'}` right after hello. */
  invalidReadyFrame?: boolean
  /** Send an undecryptable frame instead of the sealed `e2ee_authenticated` reply. */
  undecryptableAuthResponse?: boolean
  /** Send a binary frame instead of the expected reply, at the given handshake stage. */
  binaryFrameAt?: FakeOrcadBinaryFrameStage
  /** Close the socket instead of responding, at the given handshake stage. */
  closeAt?: FakeOrcadHandshakeCloseStage
  /** Answers a decrypted RPC request; default echoes `{worktrees: []}` for every method. */
  handleRequest?: (method: string, params: unknown) => FakeOrcadRpcResponse
  /** Text served as the sole SnapshotChunk(3) after every Subscribe. Default: no chunk sent. */
  terminalSnapshotText?: string
}

export type FakeOrcadSubscribeFrame = {
  terminal: string
  streamId: number
  client?: { id: string; type: 'mobile' | 'desktop' }
  viewport?: { cols: number; rows: number }
  capabilities?: Record<string, unknown>
}

type FakeOrcadMultiplexState = {
  rpcId: string
  streams: Map<number, FakeOrcadSubscribeFrame>
}

export type FakeOrcadServer = {
  endpoint: string
  serverPublicKeyB64: string
  deviceToken: string
  authFrames: Record<string, unknown>[]
  requestMethods: string[]
  /** Every decrypted RPC request, method + params, in receipt order — for sequencing assertions. */
  requestFrames: { method: string; params: unknown }[]
  binaryFramesReceived: Uint8Array[]
  /** Every Subscribe(9) control frame received, across all connections. */
  subscribeFrames: FakeOrcadSubscribeFrame[]
  /** Every Input(7) frame received, decoded to UTF-8 text. */
  inputReceived: { streamId: number; text: string }[]
  /** Every Resize(8) frame received. */
  resizesReceived: { streamId: number; cols: number; rows: number }[]
  /** Every Unsubscribe(10) frame received. */
  unsubscribedStreamIds: number[]
  connectionCount(): number
  /** Force-closes every currently open socket without shutting the server down. */
  closeActiveConnections(code?: number, reason?: string): void
  /** Seals and sends `bytes` as a binary WS frame to every authenticated connection, on demand. */
  sendBinaryToActiveConnections(bytes: Uint8Array): void
  /** Sends a live Output(1) frame to every connection currently subscribed to `streamId`. */
  pushTerminalOutput(streamId: number, text: string): void
  /** Sends a streaming `{type:'error', streamId, message}` emit on the multiplex rpc id. */
  pushMultiplexError(streamId: number, message: string): void
  close(): Promise<void>
}

const DEFAULT_RESPONSE: FakeOrcadRpcResponse = { ok: true, result: { worktrees: [] } }

export async function startFakeOrcadServer(
  options: FakeOrcadServerOptions = {}
): Promise<FakeOrcadServer> {
  const runtimeId = options.runtimeId ?? DEFAULT_RUNTIME_ID
  const deviceToken = options.deviceToken ?? DEFAULT_DEVICE_TOKEN
  const serverKeyPair = generateKeyPair()
  const httpServer = createServer()
  const wss = new WebSocketServer({ server: httpServer })
  const authFrames: Record<string, unknown>[] = []
  const requestMethods: string[] = []
  const requestFrames: { method: string; params: unknown }[] = []
  const binaryFramesReceived: Uint8Array[] = []
  const subscribeFrames: FakeOrcadSubscribeFrame[] = []
  const inputReceived: { streamId: number; text: string }[] = []
  const resizesReceived: { streamId: number; cols: number; rows: number }[] = []
  const unsubscribedStreamIds: number[] = []
  const activeSockets = new Set<NodeWebSocket>()
  const authenticatedKeys = new Map<NodeWebSocket, Uint8Array>()
  const multiplexStates = new Map<NodeWebSocket, FakeOrcadMultiplexState>()
  let connectionCount = 0

  function sendStreamEmit(
    socket: NodeWebSocket,
    key: Uint8Array,
    rpcId: string,
    result: unknown
  ): void {
    socket.send(
      encrypt(
        JSON.stringify({ id: rpcId, ok: true, result, _meta: { runtimeId }, streaming: true }),
        key
      )
    )
  }

  function sendTerminalFrame(
    socket: NodeWebSocket,
    key: Uint8Array,
    frame: TerminalStreamFrame
  ): void {
    socket.send(encryptBytes(encodeTerminalStreamFrame(frame), key))
  }

  wss.on('connection', (ws) => {
    connectionCount += 1
    activeSockets.add(ws)
    ws.on('close', () => {
      activeSockets.delete(ws)
      authenticatedKeys.delete(ws)
      multiplexStates.delete(ws)
    })

    let sharedKey: Uint8Array | null = null
    let authenticated = false

    ws.on('message', (data: RawData, isBinary: boolean) => {
      if (!sharedKey) {
        handleHello(ws, data, isBinary)
        return
      }
      if (!authenticated) {
        authenticated = handleAuth(ws, data, isBinary, sharedKey)
        return
      }
      handleRpc(ws, data, isBinary, sharedKey)
    })

    function handleHello(socket: NodeWebSocket, data: RawData, isBinary: boolean): void {
      if (isBinary) {
        socket.close(4002, 'expected plaintext e2ee_hello')
        return
      }
      const hello = JSON.parse(data.toString()) as { type?: string; publicKeyB64?: string }
      const clientPublicKey = publicKeyFromBase64(hello.publicKeyB64 ?? '')
      sharedKey = deriveSharedKey(serverKeyPair.secretKey, clientPublicKey)
      if (options.closeAt === 'hello') {
        socket.close(4000, 'closing at hello')
        return
      }
      if (options.binaryFrameAt === 'ready') {
        socket.send(new Uint8Array([1, 2, 3]))
        return
      }
      if (options.invalidReadyFrame) {
        socket.send(JSON.stringify({ type: 'not_ready' }))
        return
      }
      socket.send(JSON.stringify({ type: 'e2ee_ready' }))
    }

    function handleAuth(
      socket: NodeWebSocket,
      data: RawData,
      isBinary: boolean,
      key: Uint8Array
    ): boolean {
      if (isBinary) {
        socket.close(4002, 'expected sealed e2ee_auth')
        return false
      }
      const plaintext = decrypt(data.toString(), key)
      if (plaintext === null) {
        socket.close(4003, 'decrypt failed')
        return false
      }
      const auth = JSON.parse(plaintext) as Record<string, unknown>
      authFrames.push(auth)
      if (options.closeAt === 'auth') {
        socket.close(4000, 'closing at auth')
        return false
      }
      if (options.rejectAuth || auth.type !== 'e2ee_auth' || auth.deviceToken !== deviceToken) {
        socket.send(
          encrypt(JSON.stringify({ type: 'e2ee_error', error: { code: 'unauthorized' } }), key)
        )
        socket.close(4001, 'auth failed')
        return false
      }
      if (options.binaryFrameAt === 'authenticated') {
        socket.send(new Uint8Array([1, 2, 3]))
        return false
      }
      if (options.undecryptableAuthResponse) {
        socket.send('not-decryptable-garbage')
        return false
      }
      socket.send(encrypt(JSON.stringify({ type: 'e2ee_authenticated' }), key))
      authenticatedKeys.set(socket, key)
      return true
    }

    function handleRpc(
      socket: NodeWebSocket,
      data: RawData,
      isBinary: boolean,
      key: Uint8Array
    ): void {
      if (options.binaryFrameAt === 'runtime') {
        socket.send(new Uint8Array([1, 2, 3]))
        return
      }
      if (isBinary) {
        const plaintext = decryptBytes(toUint8Array(data), key)
        if (plaintext) {
          binaryFramesReceived.push(plaintext)
          handleTerminalStreamFrame(socket, key, plaintext)
        }
        return
      }
      const plaintext = decrypt(data.toString(), key)
      if (plaintext === null) {
        socket.close(4003, 'decrypt failed')
        return
      }
      const request = JSON.parse(plaintext) as { id: string; method: string; params?: unknown }
      requestMethods.push(request.method)
      requestFrames.push({ method: request.method, params: request.params })
      if (request.method === 'terminal.multiplex') {
        multiplexStates.set(socket, { rpcId: request.id, streams: new Map() })
        sendStreamEmit(socket, key, request.id, { type: 'ready' })
        return
      }
      const handled = options.handleRequest?.(request.method, request.params) ?? DEFAULT_RESPONSE
      const response = handled.ok
        ? { id: request.id, ok: true, result: handled.result, _meta: { runtimeId } }
        : { id: request.id, ok: false, error: handled.error, _meta: { runtimeId: null } }
      socket.send(encrypt(JSON.stringify(response), key))
    }

    // Only a decoded Subscribe(9)/Input(7)/Resize(8)/Unsubscribe(10) frame does anything here;
    // anything else (undecodable bytes, unknown opcodes) is silently dropped, never throws.
    function handleTerminalStreamFrame(
      socket: NodeWebSocket,
      key: Uint8Array,
      bytes: Uint8Array
    ): void {
      const state = multiplexStates.get(socket)
      if (!state) {
        return
      }
      const frame = decodeTerminalStreamFrame(bytes)
      if (!frame) {
        return
      }
      switch (frame.opcode) {
        case TerminalStreamOpcode.Subscribe:
          handleSubscribe(socket, key, state, frame)
          return
        case TerminalStreamOpcode.Input:
          inputReceived.push({
            streamId: frame.streamId,
            text: decodeTerminalStreamText(frame.payload)
          })
          return
        case TerminalStreamOpcode.Resize:
          handleResize(socket, key, state, frame)
          return
        case TerminalStreamOpcode.Unsubscribe:
          unsubscribedStreamIds.push(frame.streamId)
          state.streams.delete(frame.streamId)
          return
        default:
          return
      }
    }

    function handleSubscribe(
      socket: NodeWebSocket,
      key: Uint8Array,
      state: FakeOrcadMultiplexState,
      frame: TerminalStreamFrame
    ): void {
      const parsed = decodeTerminalStreamJson<FakeOrcadSubscribeFrame>(frame.payload)
      if (!parsed) {
        return
      }
      subscribeFrames.push(parsed)
      state.streams.set(parsed.streamId, parsed)
      const cols = parsed.viewport?.cols ?? 80
      const rows = parsed.viewport?.rows ?? 24
      sendStreamEmit(socket, key, state.rpcId, {
        type: 'subscribed',
        streamId: parsed.streamId,
        terminal: parsed.terminal,
        cols,
        rows
      })
      sendTerminalFrame(socket, key, {
        opcode: TerminalStreamOpcode.SnapshotStart,
        streamId: parsed.streamId,
        seq: 0,
        payload: encodeTerminalStreamJson({
          kind: 'scrollback',
          cols,
          rows,
          displayMode: 'normal',
          truncated: false,
          truncatedByByteBudget: false
        })
      })
      if (options.terminalSnapshotText !== undefined) {
        sendTerminalFrame(socket, key, {
          opcode: TerminalStreamOpcode.SnapshotChunk,
          streamId: parsed.streamId,
          seq: 0,
          payload: encodeTerminalStreamText(options.terminalSnapshotText)
        })
      }
      sendTerminalFrame(socket, key, {
        opcode: TerminalStreamOpcode.SnapshotEnd,
        streamId: parsed.streamId,
        seq: 0,
        payload: new Uint8Array(0)
      })
    }

    function handleResize(
      socket: NodeWebSocket,
      key: Uint8Array,
      state: FakeOrcadMultiplexState,
      frame: TerminalStreamFrame
    ): void {
      const resize = decodeTerminalStreamJson<{ cols: number; rows: number }>(frame.payload)
      if (!resize) {
        return
      }
      resizesReceived.push({ streamId: frame.streamId, ...resize })
      // Real contract: Resize is only honored if `client` was supplied in Subscribe.
      if (!state.streams.get(frame.streamId)?.client) {
        return
      }
      sendTerminalFrame(socket, key, {
        opcode: TerminalStreamOpcode.Resized,
        streamId: frame.streamId,
        seq: 0,
        payload: encodeTerminalStreamJson({
          cols: resize.cols,
          rows: resize.rows,
          displayMode: 'normal',
          reason: 'client',
          seq: 0
        })
      })
    }
  })

  await listen(httpServer)
  const address = httpServer.address()
  if (!address || typeof address === 'string') {
    throw new Error('Expected TCP test server')
  }

  return {
    endpoint: `ws://127.0.0.1:${address.port}`,
    serverPublicKeyB64: publicKeyToBase64(serverKeyPair.publicKey),
    deviceToken,
    authFrames,
    requestMethods,
    requestFrames,
    binaryFramesReceived,
    subscribeFrames,
    inputReceived,
    resizesReceived,
    unsubscribedStreamIds,
    connectionCount: () => connectionCount,
    pushTerminalOutput(streamId: number, text: string) {
      for (const [socket, key] of authenticatedKeys) {
        if (multiplexStates.get(socket)?.streams.has(streamId)) {
          sendTerminalFrame(socket, key, {
            opcode: TerminalStreamOpcode.Output,
            streamId,
            seq: 0,
            payload: encodeTerminalStreamText(text)
          })
        }
      }
    },
    pushMultiplexError(streamId: number, message: string) {
      for (const [socket, key] of authenticatedKeys) {
        const state = multiplexStates.get(socket)
        if (state?.streams.has(streamId)) {
          sendStreamEmit(socket, key, state.rpcId, { type: 'error', streamId, message })
        }
      }
    },
    closeActiveConnections(code?: number, reason?: string) {
      for (const socket of activeSockets) {
        socket.close(code, reason)
      }
    },
    sendBinaryToActiveConnections(bytes: Uint8Array) {
      for (const [socket, key] of authenticatedKeys) {
        socket.send(encryptBytes(bytes, key))
      }
    },
    close: async () => {
      await new Promise<void>((resolve) => {
        wss.close(() => resolve())
        for (const client of activeSockets) {
          client.close()
        }
      })
      await closeHttpServer(httpServer)
    }
  }
}

/** `ws` delivers binary payloads as Buffer (a Uint8Array subclass) unless fragmented into an array. */
function toUint8Array(data: RawData): Uint8Array {
  if (Array.isArray(data)) {
    return new Uint8Array(Buffer.concat(data))
  }
  if (data instanceof ArrayBuffer) {
    return new Uint8Array(data)
  }
  return new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
}

async function listen(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject)
      resolve()
    })
  })
}

async function closeHttpServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error)
        return
      }
      resolve()
    })
  })
}
