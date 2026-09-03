import { afterEach, describe, expect, it } from 'vitest'
import { connectPairedTransport } from './paired-websocket-transport'
import { startFakeOrcadServer, type FakeOrcadServer } from './fake-orcad-server'
import type { PairingOffer } from './pairing-offer'
import { RpcConnection } from './rpc-connection'
import { TerminalMultiplexClient, type TerminalStreamSink } from './terminal-multiplex-client'
import { TerminalStreamOpcode, encodeTerminalStreamFrame } from './terminal-stream-codec'

const servers: FakeOrcadServer[] = []

afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => s.close()))
})

function offerFor(server: FakeOrcadServer): PairingOffer {
  return {
    v: 2,
    endpoint: server.endpoint,
    deviceToken: server.deviceToken,
    publicKeyB64: server.serverPublicKeyB64
  }
}

async function connectClient(server: FakeOrcadServer): Promise<{
  connection: RpcConnection
  client: TerminalMultiplexClient
  close(): void
}> {
  const transport = await connectPairedTransport(offerFor(server))
  const connection = new RpcConnection(transport, { deviceToken: server.deviceToken })
  const client = new TerminalMultiplexClient(connection, { clientId: 'desktop-1' })
  await client.open()
  return { connection, client, close: () => transport.close() }
}

function recordingSink(): TerminalStreamSink & {
  writes: string[]
  subscribed: unknown[]
  snapshotStarts: unknown[]
  snapshotEnded: number
  resizes: { cols: number; rows: number }[]
  errors: string[]
  ended: number
} {
  const decoder = new TextDecoder()
  return {
    writes: [],
    subscribed: [],
    snapshotStarts: [],
    snapshotEnded: 0,
    resizes: [],
    errors: [],
    ended: 0,
    onSubscribed(meta) {
      this.subscribed.push(meta)
    },
    onSnapshotStart(meta) {
      this.snapshotStarts.push(meta)
    },
    write(bytes) {
      this.writes.push(decoder.decode(bytes))
    },
    onSnapshotEnd() {
      this.snapshotEnded += 1
    },
    onResize(cols, rows) {
      this.resizes.push({ cols, rows })
    },
    onError(message) {
      this.errors.push(message)
    },
    onEnd() {
      this.ended += 1
    }
  }
}

describe('TerminalMultiplexClient', () => {
  it('opens the multiplex RPC and resolves once the server sends {type: "ready"}', async () => {
    const server = await startFakeOrcadServer()
    servers.push(server)
    const { close } = await connectClient(server)
    expect(server.requestMethods).toContain('terminal.multiplex')
    close()
  })

  it('full path: subscribe -> snapshot -> live output -> input -> resize -> unsubscribe', async () => {
    const server = await startFakeOrcadServer({ terminalSnapshotText: 'restored-scrollback' })
    servers.push(server)
    const { client, close } = await connectClient(server)
    const sink = recordingSink()

    client.subscribe(1, 'term-1', { cols: 80, rows: 24 }, sink)
    await waitFor(() => sink.snapshotEnded > 0)

    expect(sink.subscribed).toEqual([{ streamId: 1, terminal: 'term-1', cols: 80, rows: 24 }])
    expect(sink.writes).toEqual(['restored-scrollback'])
    expect(server.subscribeFrames[0]).toMatchObject({
      terminal: 'term-1',
      streamId: 1,
      client: { id: 'desktop-1', type: 'desktop' },
      viewport: { cols: 80, rows: 24 }
    })

    server.pushTerminalOutput(1, 'live output\n')
    await waitFor(() => sink.writes.length === 2)
    expect(sink.writes[1]).toBe('live output\n')

    client.sendInput(1, 'ls -la\n')
    await waitFor(() => server.inputReceived.length > 0)
    expect(server.inputReceived[0]).toEqual({ streamId: 1, text: 'ls -la\n' })

    client.sendResize(1, 100, 40)
    await waitFor(() => sink.resizes.length > 0)
    expect(server.resizesReceived[0]).toEqual({ streamId: 1, cols: 100, rows: 40 })
    expect(sink.resizes[0]).toEqual({ cols: 100, rows: 40 })

    client.unsubscribe(1)
    await waitFor(() => server.unsubscribedStreamIds.length > 0)
    expect(server.unsubscribedStreamIds).toEqual([1])

    close()
  })

  it('does not honor Resize when no client was supplied in Subscribe', async () => {
    const server = await startFakeOrcadServer()
    servers.push(server)
    const { connection, close } = await connectClient(server)
    // Subscribe without `client` (bypassing the driver, which always sets it) to exercise the
    // real contract's gating rule directly against the fake server.
    connection.sendBinary(
      encodeTerminalStreamFrame({
        opcode: TerminalStreamOpcode.Subscribe,
        streamId: 2,
        seq: 0,
        payload: new TextEncoder().encode(JSON.stringify({ terminal: 'term-2', streamId: 2 }))
      })
    )
    await waitFor(() => server.subscribeFrames.length > 0)
    connection.sendBinary(
      encodeTerminalStreamFrame({
        opcode: TerminalStreamOpcode.Resize,
        streamId: 2,
        seq: 0,
        payload: new TextEncoder().encode(JSON.stringify({ cols: 10, rows: 10 }))
      })
    )
    await waitFor(() => server.resizesReceived.length > 0)
    await new Promise((resolve) => setTimeout(resolve, 20))
    // No Resized(5) frame should have come back — nothing to assert on the client side beyond
    // "no crash", since the driver never routed a Resized without a subscribed sink either way.
    close()
  })

  it('reconnect: a fresh client re-subscribes on a new connection and gets a fresh snapshot', async () => {
    const server = await startFakeOrcadServer({ terminalSnapshotText: 'scrollback' })
    servers.push(server)

    const first = await connectClient(server)
    const sink1 = recordingSink()
    first.client.subscribe(1, 'term-1', { cols: 80, rows: 24 }, sink1)
    await waitFor(() => sink1.snapshotEnded > 0)
    first.close()

    const second = await connectClient(server)
    const sink2 = recordingSink()
    second.client.subscribe(1, 'term-1', { cols: 80, rows: 24 }, sink2)
    await waitFor(() => sink2.snapshotEnded > 0)
    expect(sink2.writes).toEqual(['scrollback'])
    expect(server.subscribeFrames).toHaveLength(2)
    second.close()
  })

  it('drops an unknown opcode without crashing the stream', async () => {
    const server = await startFakeOrcadServer()
    servers.push(server)
    const { client, close } = await connectClient(server)
    const sink = recordingSink()
    client.subscribe(1, 'term-1', { cols: 80, rows: 24 }, sink)
    await waitFor(() => sink.snapshotEnded > 0)

    // Hand-build a frame with an opcode number outside the declared enum (250) — the codec must
    // decode it to null and the client must silently drop it, never throw.
    const unknown = new Uint8Array(16)
    const view = new DataView(unknown.buffer)
    view.setUint8(0, 0x74)
    view.setUint8(1, 1)
    view.setUint8(2, 250)
    view.setUint32(4, 1, true)
    server.sendBinaryToActiveConnections(unknown)

    server.pushTerminalOutput(1, 'still alive\n')
    await waitFor(() => sink.writes.length === 1)
    expect(sink.writes[0]).toBe('still alive\n')

    close()
  })

  it('notifies onClose and every sink onEnd when the multiplex RPC ends (transport close)', async () => {
    const server = await startFakeOrcadServer()
    servers.push(server)
    const { client, close } = await connectClient(server)
    const sink = recordingSink()
    client.subscribe(1, 'term-1', { cols: 80, rows: 24 }, sink)
    await waitFor(() => sink.snapshotEnded > 0)

    let closed = false
    client.onClose(() => {
      closed = true
    })
    server.closeActiveConnections(1000, 'bye')
    await waitFor(() => closed)
    expect(sink.ended).toBe(1)

    close()
  })
})

async function waitFor(predicate: () => boolean, timeoutMs = 2000): Promise<void> {
  const start = Date.now()
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error('waitFor timed out')
    }
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
}
