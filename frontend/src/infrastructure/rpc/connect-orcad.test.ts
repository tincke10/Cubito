import { afterEach, describe, expect, it, vi } from 'vitest'
import { WebSocketServer } from 'ws'
import { connectOrcad } from './connect-orcad'
import { startFakeOrcadServer, type FakeOrcadServer } from './fake-orcad-server'
import type { PairingOffer } from './pairing-offer'
import { mapPsStatusToAgentStatus } from '../../application/fan-out-model'

function offerFor(server: FakeOrcadServer): PairingOffer {
  return {
    v: 2,
    endpoint: server.endpoint,
    deviceToken: server.deviceToken,
    publicKeyB64: server.serverPublicKeyB64
  }
}

describe('connectOrcad', () => {
  const servers: FakeOrcadServer[] = []
  const closers: (() => Promise<void>)[] = []

  afterEach(async () => {
    await Promise.all(servers.splice(0).map((server) => server.close()))
    await Promise.all(closers.splice(0).map((close) => close()))
  })

  it('lists worktrees in the shape buildWorktreeGraph consumes (CO-304)', async () => {
    const record = {
      id: 'w1',
      branch: 'refs/heads/main',
      parentWorktreeId: null,
      childWorktreeIds: [],
      workspaceStatus: 'in-progress',
      git: { path: '/repo', isMainWorktree: true }
    }
    const server = await startFakeOrcadServer({
      handleRequest: () => ({ ok: true, result: { worktrees: [record] } })
    })
    servers.push(server)

    const connection = await connectOrcad(offerFor(server))
    try {
      await expect(connection.gateway.listWorktrees()).resolves.toEqual([record])
    } finally {
      connection.close()
    }
  })

  it('sends the auth frame carrying the offer deviceToken', async () => {
    const server = await startFakeOrcadServer()
    servers.push(server)

    const connection = await connectOrcad(offerFor(server))
    connection.close()

    expect(server.authFrames).toEqual([
      { type: 'e2ee_auth', deviceToken: server.deviceToken, clientCapabilities: [] }
    ])
  })

  it('surfaces runtimeId on the connection once the first call resolves', async () => {
    const server = await startFakeOrcadServer({ runtimeId: 'rt-99' })
    servers.push(server)

    const connection = await connectOrcad(offerFor(server))
    try {
      expect(connection.runtimeId).toBeUndefined()
      await connection.gateway.listWorktrees()
      expect(connection.runtimeId).toBe('rt-99')
    } finally {
      connection.close()
    }
  })

  it('propagates close()/onClose() from the underlying transport', async () => {
    const server = await startFakeOrcadServer()
    servers.push(server)

    const connection = await connectOrcad(offerFor(server))
    const closed = new Promise<string>((resolve) => connection.onClose((reason) => resolve(reason)))
    server.closeActiveConnections(1000, 'bye')

    await expect(closed).resolves.toBe('connection_closed')
  })

  it('a caller-initiated close() is a no-op beyond closing the socket (no onClose double-fire required)', async () => {
    const server = await startFakeOrcadServer()
    servers.push(server)

    const connection = await connectOrcad(offerFor(server))
    let closeCount = 0
    connection.onClose(() => {
      closeCount += 1
    })
    connection.close()
    connection.close()
    await new Promise((resolve) => setTimeout(resolve, 20))

    expect(closeCount).toBeLessThanOrEqual(1)
  })

  it('exposes a working terminals port: create, subscribe, input/resize/output, close (P3.4)', async () => {
    const server = await startFakeOrcadServer({
      handleRequest: (method) => {
        // orcad's real shape: terminal.create returns a terminal OBJECT; the handle is nested.
        if (method === 'terminal.create')
          return { ok: true, result: { terminal: { handle: 'term-1' } } }
        if (method === 'terminal.close') return { ok: true, result: { close: true } }
        return { ok: true, result: { worktrees: [] } }
      }
    })
    servers.push(server)

    const connection = await connectOrcad(offerFor(server))
    try {
      const created = await connection.terminals.createTerminal('w1')
      expect(created).toEqual({ terminal: 'term-1' })

      const writes: string[] = []
      let subscribedMeta: unknown
      let resized: { cols: number; rows: number } | null = null
      connection.terminals.subscribe(
        1,
        created.terminal,
        { cols: 80, rows: 24 },
        {
          onSubscribed: (meta) => {
            subscribedMeta = meta
          },
          onSnapshotStart: () => {},
          write: (bytes) => writes.push(new TextDecoder().decode(bytes)),
          onSnapshotEnd: () => {},
          onResize: (cols, rows) => {
            resized = { cols, rows }
          },
          onError: () => {},
          onEnd: () => {}
        }
      )

      await vi.waitFor(() =>
        expect(subscribedMeta).toMatchObject({ streamId: 1, terminal: 'term-1' })
      )
      expect(server.subscribeFrames).toContainEqual(
        expect.objectContaining({ streamId: 1, terminal: 'term-1' })
      )

      connection.terminals.sendInput(1, 'echo hi\n')
      await vi.waitFor(() =>
        expect(server.inputReceived).toContainEqual({ streamId: 1, text: 'echo hi\n' })
      )

      server.pushTerminalOutput(1, 'hi\n')
      await vi.waitFor(() => expect(writes).toContain('hi\n'))

      connection.terminals.sendResize(1, 100, 40)
      await vi.waitFor(() => expect(resized).toEqual({ cols: 100, rows: 40 }))

      connection.terminals.unsubscribe(1)
      await vi.waitFor(() => expect(server.unsubscribedStreamIds).toContain(1))

      await expect(connection.terminals.close(created.terminal)).resolves.toBeUndefined()
    } finally {
      connection.close()
    }
  })

  it('adds a repo via repo.add, in the shape addRepo resolves (no server change)', async () => {
    const repo = { id: 'repo-2', path: '/abs/repo-2', displayName: 'Repo Two', kind: 'git' }
    const server = await startFakeOrcadServer({
      handleRequest: (method) => {
        if (method === 'repo.add') return { ok: true, result: { repo } }
        return { ok: true, result: { worktrees: [] } }
      }
    })
    servers.push(server)

    const connection = await connectOrcad(offerFor(server))
    try {
      await expect(
        connection.gateway.addRepo({ path: '/abs/repo-2', kind: 'git' })
      ).resolves.toEqual(repo)
    } finally {
      connection.close()
    }
  })

  it('surfaces a repo.add server error (relative path) readably', async () => {
    const server = await startFakeOrcadServer({
      handleRequest: (method) => {
        if (method === 'repo.add')
          return {
            ok: false,
            error: { code: 'invalid_argument', message: 'Project path must be an absolute path' }
          }
        return { ok: true, result: { worktrees: [] } }
      }
    })
    servers.push(server)

    const connection = await connectOrcad(offerFor(server))
    try {
      await expect(connection.gateway.addRepo({ path: 'relative/path' })).rejects.toThrow(
        'Project path must be an absolute path'
      )
    } finally {
      connection.close()
    }
  })

  it('sends N worktree.create calls with DISTINCT clientMutationIds, sequentially', async () => {
    let nextId = 1
    const server = await startFakeOrcadServer({
      handleRequest: (method) => {
        if (method === 'worktree.create') {
          return { ok: true, result: { worktree: { id: `w${nextId++}` } } }
        }
        return { ok: true, result: { worktrees: [] } }
      }
    })
    servers.push(server)

    const connection = await connectOrcad(offerFor(server))
    try {
      const inputs = [
        { repo: 'id:r1', parentWorktree: 'w0', clientMutationId: 'm1' },
        { repo: 'id:r1', parentWorktree: 'w0', clientMutationId: 'm2' },
        { repo: 'id:r1', parentWorktree: 'w0', clientMutationId: 'm3' }
      ]
      for (const input of inputs) {
        await connection.gateway.createWorktree(input)
      }

      const createFrames = server.requestFrames.filter(
        (frame) => frame.method === 'worktree.create'
      )
      expect(createFrames).toEqual(
        inputs.map((input) => ({ method: 'worktree.create', params: input }))
      )
      const mutationIds = createFrames.map(
        (frame) => (frame.params as { clientMutationId: string }).clientMutationId
      )
      expect(new Set(mutationIds).size).toBe(mutationIds.length)
    } finally {
      connection.close()
    }
  })

  it('listWorktreePs() maps a served worktree.ps payload into WorktreePsRow[] and a member status flips', async () => {
    let status = 'working'
    const server = await startFakeOrcadServer({
      handleRequest: (method) => {
        if (method === 'worktree.ps') {
          return { ok: true, result: { worktrees: [{ worktreeId: 'w1', status }] } }
        }
        return { ok: true, result: { worktrees: [] } }
      }
    })
    servers.push(server)

    const connection = await connectOrcad(offerFor(server))
    try {
      const first = await connection.gateway.listWorktreePs()
      expect(first).toEqual([{ worktreeId: 'w1', status: 'working' }])
      expect(mapPsStatusToAgentStatus(first[0]!.status)).toBe('working')

      status = 'permission'
      const second = await connection.gateway.listWorktreePs()
      expect(second).toEqual([{ worktreeId: 'w1', status: 'permission' }])
      expect(mapPsStatusToAgentStatus(second[0]!.status)).toBe('waiting-input')
    } finally {
      connection.close()
    }
  })

  it('rejects with remote_runtime_unavailable if no handshake response arrives within timeoutMs', async () => {
    const wss = new WebSocketServer({ port: 0 })
    await new Promise<void>((resolve) => wss.once('listening', resolve))
    closers.push(
      () =>
        new Promise<void>((resolve) => {
          // The client's own socket never got the chance to close (the handshake never
          // resolves), so force-terminate leftover connections before shutting the server down.
          for (const client of wss.clients) client.terminate()
          wss.close(() => resolve())
        })
    )
    const address = wss.address()
    const port = typeof address === 'object' && address !== null ? address.port : 0
    const offer: PairingOffer = {
      v: 2,
      endpoint: `ws://127.0.0.1:${port}`,
      deviceToken: 'tok',
      publicKeyB64: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='
    }

    await expect(connectOrcad(offer, { timeoutMs: 50 })).rejects.toMatchObject({
      code: 'remote_runtime_unavailable'
    })
  })
})
