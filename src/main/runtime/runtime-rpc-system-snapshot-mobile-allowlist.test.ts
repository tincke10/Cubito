import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { OrcaRuntimeService } from './orca-runtime'
import { OrcaRuntimeRpcServer } from './runtime-rpc'
import { DeviceRegistry } from './device-registry'

// Why (Change B, Wave 5): 'system.snapshot' must be reachable from a mobile-scoped
// WebSocket token — a real end-to-end dispatch check, not just a Set membership read.
describe('OrcaRuntimeRpcServer mobile allowlist: system.snapshot', () => {
  it('allows a mobile-scoped token to call system.snapshot', async () => {
    const userDataPath = mkdtempSync(join(tmpdir(), 'orca-runtime-rpc-system-graph-'))
    const runtime = {
      getRuntimeId: () => 'test-runtime',
      getRepoConnectionId: () => null,
      watchFileExplorer: async () => async () => {}
    } as unknown as OrcaRuntimeService
    const server = new OrcaRuntimeRpcServer({ runtime, userDataPath, enableWebSocket: false })
    server['deviceRegistry'] = new DeviceRegistry(userDataPath)
    const mobile = server['deviceRegistry']!.addDevice('phone', 'mobile')
    const replies: Record<string, unknown>[] = []

    await server['handleWebSocketMessage'](
      JSON.stringify({
        id: 'req_system_snapshot',
        method: 'system.snapshot',
        deviceToken: mobile.token,
        params: { worktree: 'repo-1::/repo/app' }
      }),
      (response) => replies.push(JSON.parse(response) as Record<string, unknown>),
      () => {}
    )

    expect(replies).toContainEqual(expect.objectContaining({ id: 'req_system_snapshot', ok: true }))
  })
})
