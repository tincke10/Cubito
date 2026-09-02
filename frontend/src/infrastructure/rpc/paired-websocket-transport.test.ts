import { afterEach, describe, expect, it } from 'vitest'
import { connectPairedTransport, PairingConnectionError } from './paired-websocket-transport'
import { startFakeOrcadServer, type FakeOrcadServer } from './fake-orcad-server'
import type { PairingOffer } from './pairing-offer'

function offerFor(server: FakeOrcadServer): PairingOffer {
  return { v: 2, endpoint: server.endpoint, deviceToken: server.deviceToken, publicKeyB64: server.serverPublicKeyB64 }
}

describe('connectPairedTransport', () => {
  const servers: FakeOrcadServer[] = []

  afterEach(async () => {
    await Promise.all(servers.splice(0).map((server) => server.close()))
  })

  it('opens exactly one socket and resolves only once the handshake reaches ready', async () => {
    const server = await startFakeOrcadServer()
    servers.push(server)

    const transport = await connectPairedTransport(offerFor(server))
    transport.close()

    expect(server.connectionCount()).toBe(1)
  })

  it('rejects with PairingConnectionError when the server rejects auth', async () => {
    const server = await startFakeOrcadServer({ rejectAuth: true })
    servers.push(server)

    await expect(connectPairedTransport(offerFor(server))).rejects.toMatchObject({
      code: 'unauthorized',
      stage: 'access-grant'
    })
    await expect(connectPairedTransport(offerFor(server))).rejects.toBeInstanceOf(PairingConnectionError)
  })

  it('rejects with PairingConnectionError when the server sends a garbage frame', async () => {
    const server = await startFakeOrcadServer({ undecryptableAuthResponse: true })
    servers.push(server)

    await expect(connectPairedTransport(offerFor(server))).rejects.toMatchObject({
      code: 'invalid_runtime_response',
      stage: 'host-identity'
    })
  })

  it('rejects with PairingConnectionError when the server closes mid-handshake', async () => {
    const server = await startFakeOrcadServer({ closeAt: 'auth' })
    servers.push(server)

    await expect(connectPairedTransport(offerFor(server))).rejects.toMatchObject({
      code: 'remote_runtime_unavailable',
      closeCode: 4000
    })
  })

  it('completes a call end to end: request leaves sealed, response arrives as plaintext', async () => {
    const server = await startFakeOrcadServer({
      handleRequest: (method) => ({ ok: true, result: { echoedMethod: method } })
    })
    servers.push(server)

    const transport = await connectPairedTransport(offerFor(server))
    try {
      const received = new Promise<string>((resolve) => {
        transport.onMessage((data) => resolve(data))
      })
      const requestPlaintext = JSON.stringify({ id: 'req-1', deviceToken: server.deviceToken, method: 'worktree.list' })
      transport.send(requestPlaintext)

      const plaintext = await received
      expect(JSON.parse(plaintext)).toMatchObject({ id: 'req-1', ok: true, result: { echoedMethod: 'worktree.list' } })
      expect(server.requestMethods).toEqual(['worktree.list'])
    } finally {
      transport.close()
    }
  })

  it('sends the auth frame sealed, decrypting to deviceToken — never authToken', async () => {
    const server = await startFakeOrcadServer()
    servers.push(server)

    const transport = await connectPairedTransport(offerFor(server))
    transport.close()

    expect(server.authFrames).toEqual([
      { type: 'e2ee_auth', deviceToken: server.deviceToken, clientCapabilities: [] }
    ])
    expect((server.authFrames[0] as Record<string, unknown>).authToken).toBeUndefined()
  })

  it('close() closes the socket and fires every registered onClose exactly once; a second close() is a no-op', async () => {
    const server = await startFakeOrcadServer()
    servers.push(server)

    const transport = await connectPairedTransport(offerFor(server))
    let closeCount = 0
    transport.onClose(() => {
      closeCount += 1
    })

    transport.close()
    transport.close()
    await new Promise((resolve) => setTimeout(resolve, 20))

    expect(closeCount).toBe(1)
  })

  it('send() throws deterministically once the handshake is no longer ready', async () => {
    const server = await startFakeOrcadServer({ binaryFrameAt: 'runtime' })
    servers.push(server)

    const transport = await connectPairedTransport(offerFor(server))
    const closed = new Promise<void>((resolve) => transport.onClose(() => resolve()))
    transport.send(JSON.stringify({ id: 'req-1', deviceToken: server.deviceToken, method: 'worktree.list' }))
    await closed

    expect(() => transport.send('{}')).toThrow()
  })

  it('a socket close after ready fires onClose with the close reason', async () => {
    const server = await startFakeOrcadServer()
    servers.push(server)

    const transport = await connectPairedTransport(offerFor(server))
    const closed = new Promise<string | undefined>((resolve) => transport.onClose((reason) => resolve(reason)))
    server.closeActiveConnections(1000, 'bye')

    await expect(closed).resolves.toBe('bye')
  })
})
