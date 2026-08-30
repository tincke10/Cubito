import type { RpcTransport } from './rpc-connection'

/**
 * Browser WebSocket implementation of RpcTransport.
 *
 * NOTE: orcad's WebSocket surface authenticates with per-device tokens issued
 * through pairing (see engine `src/main/runtime/rpc/ws-transport.ts`); remote
 * connections additionally negotiate E2EE. This adapter only moves frames —
 * the pairing handshake (or a local dev bridge to the unix socket) is the
 * next infrastructure milestone.
 */
export function createWebSocketTransport(url: string): Promise<RpcTransport & { close(): void }> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url)
    const messageHandlers = new Set<(data: string) => void>()
    const closeHandlers = new Set<(reason?: string) => void>()

    socket.addEventListener('open', () => {
      resolve({
        send: (data) => socket.send(data),
        onMessage(cb) {
          messageHandlers.add(cb)
          return () => messageHandlers.delete(cb)
        },
        onClose(cb) {
          closeHandlers.add(cb)
          return () => closeHandlers.delete(cb)
        },
        close: () => socket.close()
      })
    })
    socket.addEventListener('message', (event) => {
      if (typeof event.data === 'string') {
        for (const cb of [...messageHandlers]) cb(event.data)
      }
    })
    socket.addEventListener('close', (event) => {
      for (const cb of [...closeHandlers]) cb(event.reason)
    })
    socket.addEventListener('error', () => {
      reject(new Error(`WebSocket connection to ${url} failed`))
    })
  })
}
