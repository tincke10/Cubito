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
import { decrypt, deriveSharedKey, encrypt, generateKeyPair, publicKeyFromBase64, publicKeyToBase64 } from './e2ee-box'

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
}

export type FakeOrcadServer = {
  endpoint: string
  serverPublicKeyB64: string
  deviceToken: string
  authFrames: Record<string, unknown>[]
  requestMethods: string[]
  connectionCount(): number
  /** Force-closes every currently open socket without shutting the server down. */
  closeActiveConnections(code?: number, reason?: string): void
  close(): Promise<void>
}

const DEFAULT_RESPONSE: FakeOrcadRpcResponse = { ok: true, result: { worktrees: [] } }

export async function startFakeOrcadServer(options: FakeOrcadServerOptions = {}): Promise<FakeOrcadServer> {
  const runtimeId = options.runtimeId ?? DEFAULT_RUNTIME_ID
  const deviceToken = options.deviceToken ?? DEFAULT_DEVICE_TOKEN
  const serverKeyPair = generateKeyPair()
  const httpServer = createServer()
  const wss = new WebSocketServer({ server: httpServer })
  const authFrames: Record<string, unknown>[] = []
  const requestMethods: string[] = []
  const activeSockets = new Set<NodeWebSocket>()
  let connectionCount = 0

  wss.on('connection', (ws) => {
    connectionCount += 1
    activeSockets.add(ws)
    ws.on('close', () => activeSockets.delete(ws))

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

    function handleAuth(socket: NodeWebSocket, data: RawData, isBinary: boolean, key: Uint8Array): boolean {
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
        socket.send(encrypt(JSON.stringify({ type: 'e2ee_error', error: { code: 'unauthorized' } }), key))
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
      return true
    }

    function handleRpc(socket: NodeWebSocket, data: RawData, isBinary: boolean, key: Uint8Array): void {
      if (isBinary || options.binaryFrameAt === 'runtime') {
        socket.send(new Uint8Array([1, 2, 3]))
        return
      }
      const plaintext = decrypt(data.toString(), key)
      if (plaintext === null) {
        socket.close(4003, 'decrypt failed')
        return
      }
      const request = JSON.parse(plaintext) as { id: string; method: string; params?: unknown }
      requestMethods.push(request.method)
      const handled = options.handleRequest?.(request.method, request.params) ?? DEFAULT_RESPONSE
      const response = handled.ok
        ? { id: request.id, ok: true, result: handled.result, _meta: { runtimeId } }
        : { id: request.id, ok: false, error: handled.error, _meta: { runtimeId: null } }
      socket.send(encrypt(JSON.stringify(response), key))
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
    connectionCount: () => connectionCount,
    closeActiveConnections(code?: number, reason?: string) {
      for (const socket of activeSockets) {
        socket.close(code, reason)
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
