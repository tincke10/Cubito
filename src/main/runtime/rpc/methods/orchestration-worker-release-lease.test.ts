import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { OrcaRuntimeService } from '../../orca-runtime'
import { OrchestrationDb } from '../../orchestration/db'
import type { RpcContext } from '../core'
import { ORCHESTRATION_METHODS } from './orchestration'

const DEVICE_ID = 'device_1'
const OTHER_DEVICE_ID = 'device_2'
const COORDINATOR_PANE_KEY = 'tab_coord:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const WORKER_PANE_KEY = 'tab_worker:bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

// Why Wave 5: runShow's own lease-read tests live with runShow's other tests
// (orchestration-runs.test.ts); workerList/workerShow live here, split out to keep
// orchestration-worker-release.test.ts under the max-lines cap.
describe('orchestration worker reads: lease ownership scoping (Wave 5)', () => {
  let db: OrchestrationDb
  let runtime: OrcaRuntimeService

  beforeEach(() => {
    db = new OrchestrationDb(':memory:')
    runtime = new OrcaRuntimeService()
    runtime.setOrchestrationDb(db)
    vi.spyOn(runtime, 'validateOrchestrationAgentLauncher').mockImplementation(() => {})
    vi.spyOn(runtime, 'showManagedTerminalWorkspace').mockResolvedValue({
      id: 'repo::worktree'
    } as never)
    vi.spyOn(runtime, 'showTerminal').mockImplementation(
      async (handle) => ({ handle, worktreeId: 'repo::worktree', status: 'running' }) as never
    )
    vi.spyOn(runtime, 'createTerminal').mockResolvedValue({
      handle: 'term_worker',
      worktreeId: 'repo::worktree',
      title: 'worker'
    } as never)
    vi.spyOn(runtime, 'getTerminalPaneKey').mockImplementation((handle) =>
      handle === 'term_coord'
        ? COORDINATOR_PANE_KEY
        : handle === 'term_worker'
          ? WORKER_PANE_KEY
          : null
    )
    vi.spyOn(runtime, 'getTerminalProcessIncarnation').mockImplementation((handle) =>
      handle === 'term_worker' ? 'runtime_test:term_worker:1' : null
    )
    vi.spyOn(runtime, 'getOrchestrationDispatchAuthority').mockImplementation((handle) =>
      handle === 'term_worker'
        ? ({
            terminalHandle: handle,
            paneKey: WORKER_PANE_KEY,
            processIncarnation: 'runtime_test:term_worker:1',
            hostScope: { kind: 'local', hostId: 'local' }
          } as never)
        : null
    )
    vi.spyOn(runtime, 'waitForTerminal').mockResolvedValue({
      handle: 'term_worker',
      condition: 'tui-idle',
      satisfied: true,
      status: 'running',
      exitCode: null
    })
    vi.spyOn(runtime, 'getTerminalOrchestrationCliCommand').mockReturnValue('orca')
    vi.spyOn(runtime, 'sendTerminalAgentPrompt').mockResolvedValue({
      handle: 'term_worker',
      accepted: true,
      bytesWritten: 1
    })
  })

  afterEach(() => db.close())

  function method(name: string) {
    const found = ORCHESTRATION_METHODS.find((candidate) => candidate.name === name)
    if (!found) {
      throw new Error(`${name} method is not registered`)
    }
    return found
  }

  async function call(name: string, params: Record<string, unknown>, ctx: RpcContext) {
    const found = method(name)
    const parsed = found.params ? found.params.parse(params) : undefined
    return found.handler(parsed, ctx)
  }

  function leaseCtx(deviceId: string): RpcContext {
    return { runtime, pairedDeviceId: deviceId, clientKind: 'runtime' }
  }

  // Why: a function, not a captured constant — `runtime` is reassigned per-test in beforeEach.
  function terminalCtx(): RpcContext {
    return { runtime }
  }

  function createTerminalRun(): string {
    return db.createRun({
      objective: 'terminal Run',
      coordinatorHandle: 'term_coord',
      coordinatorPaneKey: COORDINATOR_PANE_KEY
    }).id
  }

  async function startLeaseWorker(
    deviceId = DEVICE_ID
  ): Promise<{ runId: string; dispatchId: string }> {
    const run = db.createLeaseRun({ objective: 'lease read fixture', deviceId })
    const task = db.createTask({ spec: 'lease read fixture task', runId: run.id })
    const result = (await call(
      'orchestration.workerStart',
      { task: task.id, run: run.id, worktree: 'repo::worktree', agent: 'codex' },
      leaseCtx(deviceId)
    )) as { dispatchId: string; state: string }
    expect(result.state).toBe('ready')
    return { runId: run.id, dispatchId: result.dispatchId }
  }

  async function startTerminalWorker(runId: string): Promise<string> {
    const task = db.createTask({ spec: 'terminal read fixture task', runId })
    const result = (await call(
      'orchestration.workerStart',
      { task: task.id, from: 'term_coord', agent: 'codex' },
      terminalCtx()
    )) as { dispatchId: string; state: string }
    expect(result.state).toBe('ready')
    return result.dispatchId
  }

  it('lets the lease owner list its own Run workers via workerList', async () => {
    const { runId } = await startLeaseWorker()
    const listed = (await call(
      'orchestration.workerList',
      { run: runId },
      leaseCtx(DEVICE_ID)
    )) as { workers: unknown[] }
    expect(listed.workers).toHaveLength(1)
  })

  it('requires --run for a lease workerList caller', async () => {
    await expect(call('orchestration.workerList', {}, leaseCtx(DEVICE_ID))).rejects.toMatchObject({
      code: 'run_required'
    })
  })

  it('fences a lease workerList against a Run owned by another device', async () => {
    const { runId } = await startLeaseWorker(DEVICE_ID)
    await expect(
      call('orchestration.workerList', { run: runId }, leaseCtx(OTHER_DEVICE_ID))
    ).rejects.toMatchObject({ code: 'consumer_fenced' })
  })

  it('keeps terminal workerList unscoped', async () => {
    const runId = createTerminalRun()
    await startTerminalWorker(runId)
    const listed = (await call('orchestration.workerList', { run: runId }, terminalCtx())) as {
      workers: unknown[]
    }
    expect(listed.workers).toHaveLength(1)
  })

  it('lets the lease owner read its own dispatch via workerShow', async () => {
    const { dispatchId } = await startLeaseWorker()
    const shown = (await call(
      'orchestration.workerShow',
      { dispatch: dispatchId },
      leaseCtx(DEVICE_ID)
    )) as { dispatch: { id: string } }
    expect(shown.dispatch.id).toBe(dispatchId)
  })

  it('fences a lease workerShow against a dispatch owned by another device', async () => {
    const { dispatchId } = await startLeaseWorker(DEVICE_ID)
    await expect(
      call('orchestration.workerShow', { dispatch: dispatchId }, leaseCtx(OTHER_DEVICE_ID))
    ).rejects.toMatchObject({ code: 'consumer_fenced' })
  })

  it('keeps terminal workerShow unscoped', async () => {
    const runId = createTerminalRun()
    const dispatchId = await startTerminalWorker(runId)
    const shown = (await call(
      'orchestration.workerShow',
      { dispatch: dispatchId },
      terminalCtx()
    )) as { dispatch: { id: string } }
    expect(shown.dispatch.id).toBe(dispatchId)
  })
})
