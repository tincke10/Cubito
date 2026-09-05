import { describe, expect, it } from 'vitest'
import {
  decrypt,
  deriveSharedKey,
  encrypt,
  generateKeyPair,
  publicKeyFromBase64,
  publicKeyToBase64
} from './e2ee-box'
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
      const sharedKey = deriveSharedKey(
        clientKeyPair.secretKey,
        publicKeyFromBase64(server.serverPublicKeyB64)
      )
      const socket = new WebSocket(server.endpoint)
      await waitForOpen(socket)

      socket.send(
        JSON.stringify({
          type: 'e2ee_hello',
          publicKeyB64: publicKeyToBase64(clientKeyPair.publicKey)
        })
      )
      const readyFrame = await nextMessage(socket)
      expect(JSON.parse(readyFrame)).toEqual({ type: 'e2ee_ready' })

      socket.send(
        encrypt(
          JSON.stringify({
            type: 'e2ee_auth',
            deviceToken: server.deviceToken,
            clientCapabilities: []
          }),
          sharedKey
        )
      )
      const authResponse = await nextMessage(socket)
      expect(decrypt(authResponse, sharedKey)).toBe(JSON.stringify({ type: 'e2ee_authenticated' }))
      expect(server.authFrames).toEqual([
        { type: 'e2ee_auth', deviceToken: server.deviceToken, clientCapabilities: [] }
      ])

      await new Promise<void>((resolve) => {
        socket.addEventListener('close', () => resolve(), { once: true })
        socket.close()
      })
    } finally {
      await server.close()
    }
  })

  it('records requestFrames with params in order', async () => {
    const server = await startFakeOrcadServer()
    try {
      const clientKeyPair = generateKeyPair()
      const sharedKey = deriveSharedKey(
        clientKeyPair.secretKey,
        publicKeyFromBase64(server.serverPublicKeyB64)
      )
      const socket = new WebSocket(server.endpoint)
      await waitForOpen(socket)

      socket.send(
        JSON.stringify({
          type: 'e2ee_hello',
          publicKeyB64: publicKeyToBase64(clientKeyPair.publicKey)
        })
      )
      await nextMessage(socket)
      socket.send(
        encrypt(
          JSON.stringify({
            type: 'e2ee_auth',
            deviceToken: server.deviceToken,
            clientCapabilities: []
          }),
          sharedKey
        )
      )
      await nextMessage(socket)

      socket.send(
        encrypt(JSON.stringify({ id: '1', method: 'repo.list', params: { a: 1 } }), sharedKey)
      )
      await nextMessage(socket)
      socket.send(
        encrypt(
          JSON.stringify({ id: '2', method: 'worktree.create', params: { name: 'x' } }),
          sharedKey
        )
      )
      await nextMessage(socket)

      expect(server.requestFrames).toEqual([
        { method: 'repo.list', params: { a: 1 } },
        { method: 'worktree.create', params: { name: 'x' } }
      ])

      socket.close()
    } finally {
      await server.close()
    }
  })

  it('serves a worktree.ps payload', async () => {
    const row = { worktreeId: 'w1', status: 'working' }
    const server = await startFakeOrcadServer({
      handleRequest: (method) => {
        if (method === 'worktree.ps') return { ok: true, result: { worktrees: [row] } }
        return { ok: true, result: { worktrees: [] } }
      }
    })
    try {
      const clientKeyPair = generateKeyPair()
      const sharedKey = deriveSharedKey(
        clientKeyPair.secretKey,
        publicKeyFromBase64(server.serverPublicKeyB64)
      )
      const socket = new WebSocket(server.endpoint)
      await waitForOpen(socket)

      socket.send(
        JSON.stringify({
          type: 'e2ee_hello',
          publicKeyB64: publicKeyToBase64(clientKeyPair.publicKey)
        })
      )
      await nextMessage(socket)
      socket.send(
        encrypt(
          JSON.stringify({
            type: 'e2ee_auth',
            deviceToken: server.deviceToken,
            clientCapabilities: []
          }),
          sharedKey
        )
      )
      await nextMessage(socket)

      socket.send(encrypt(JSON.stringify({ id: '1', method: 'worktree.ps' }), sharedKey))
      const response = await nextMessage(socket)
      expect(JSON.parse(decrypt(response, sharedKey) ?? '')).toMatchObject({
        ok: true,
        result: { worktrees: [row] }
      })

      socket.close()
    } finally {
      await server.close()
    }
  })
})
