import { describe, expect, it } from 'vitest'
import { decrypt, deriveSharedKey, encrypt, generateKeyPair, publicKeyFromBase64, publicKeyToBase64 } from './e2ee-box'
import { startFakeOrcadServer } from './fake-orcad-server'

function nextMessage(socket: WebSocket): Promise<string> {
  return new Promise((resolve, reject) => {
    socket.addEventListener('message', (event) => resolve(event.data as string), { once: true })
    socket.addEventListener('error', reject, { once: true })
  })
}

function waitForOpen(socket: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.addEventListener('open', () => resolve(), { once: true })
    socket.addEventListener('error', reject, { once: true })
  })
}

describe('fake-orcad-server', () => {
  it('completes the v1 handshake with a default-accept config and closes cleanly', async () => {
    const server = await startFakeOrcadServer()
    try {
      const clientKeyPair = generateKeyPair()
      const sharedKey = deriveSharedKey(clientKeyPair.secretKey, publicKeyFromBase64(server.serverPublicKeyB64))
      const socket = new WebSocket(server.endpoint)
      await waitForOpen(socket)

      socket.send(JSON.stringify({ type: 'e2ee_hello', publicKeyB64: publicKeyToBase64(clientKeyPair.publicKey) }))
      const readyFrame = await nextMessage(socket)
      expect(JSON.parse(readyFrame)).toEqual({ type: 'e2ee_ready' })

      socket.send(
        encrypt(JSON.stringify({ type: 'e2ee_auth', deviceToken: server.deviceToken, clientCapabilities: [] }), sharedKey)
      )
      const authResponse = await nextMessage(socket)
      expect(decrypt(authResponse, sharedKey)).toBe(JSON.stringify({ type: 'e2ee_authenticated' }))
      expect(server.authFrames).toEqual([{ type: 'e2ee_auth', deviceToken: server.deviceToken, clientCapabilities: [] }])

      await new Promise<void>((resolve) => {
        socket.addEventListener('close', () => resolve(), { once: true })
        socket.close()
      })
    } finally {
      await server.close()
    }
  })
})
