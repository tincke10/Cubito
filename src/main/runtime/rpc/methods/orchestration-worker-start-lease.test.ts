import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { OrcaRuntimeService } from '../../orca-runtime'
import { OrchestrationDb } from '../../orchestration/db'
import type { RpcContext } from '../core'
import { ORCHESTRATION_METHODS } from './orchestration'

const DEVICE_ID = 'device-aaaa'
const OTHER_DEVICE_ID = 'device-bbbb'

describe('orchestration.workerStart lease placement', () => {
  let db: OrchestrationDb
  let runtime: OrcaRuntimeService

  beforeEach(() => {
    db = new OrchestrationDb(':memory:')
    runtime = new OrcaRuntimeService()
    runtime.setOrchestrationDb(db)
    vi.spyOn(runtime, 'validateOrchestrationAgentLauncher').mockImplementation(() => {})
    vi.spyOn(runtime, 'showManagedTerminalWorkspace').mockResolvedValue({
      id: 'repo::explicit',
      repoId: 'repo'
    } as never)
    vi.spyOn(runtime, 'showTerminal').mockResolvedValue({
      handle: 'term_coord',
      worktreeId: 'repo::parent',
      status: 'running'
    } as never)
    vi.spyOn(runtime, 'createTerminal').mockResolvedValue({
      handle: 'term_worker',
      surface: 'background',
      warning: undefined
    } as never)
    vi.spyOn(runtime, 'getTerminalPaneKey').mockImplementation((handle) =>
      handle === 'term_worker' ? 'tab_worker:bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' : null
    )
    vi.spyOn(runtime, 'getTerminalProcessIncarnation').mockImplementation((handle) =>
      handle === 'term_worker' ? 'runtime_test:term_worker:1' : null
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

  function method() {
    const found = ORCHESTRATION_METHODS.find(
      (candidate) => candidate.name === 'orchestration.workerStart'
    )
    if (!found) {
      throw new Error('workerStart method is not registered')
    }
    return found
  }

  function createLeaseRunAndTask(deviceId = DEVICE_ID) {
    const run = db.createLeaseRun({ objective: 'Lease worker-start', deviceId })
    const task = db.createTask({ spec: 'lease task', runId: run.id })
    return { run, task }
  }

  function leaseCtx(overrides: Partial<RpcContext> = {}): RpcContext {
    return {
      runtime,
      pairedDeviceId: DEVICE_ID,
      clientKind: 'runtime',
      ...overrides
    } as RpcContext
  }

  it('starts a lease worker against an explicit existing worktree without a coordinator terminal', async () => {
    const { run, task } = createLeaseRunAndTask()
    const createSpy = vi.spyOn(db, 'createStartingWorkerDispatch')
    const params = method().params!.parse({
      task: task.id,
      run: run.id,
      worktree: 'repo::explicit',
      agent: 'codex'
    })

    const result = await method().handler(params, leaseCtx())

    expect(result).toMatchObject({ state: 'ready', runId: run.id, taskId: task.id })
    expect(runtime.showTerminal).not.toHaveBeenCalled()
    expect(runtime.showManagedTerminalWorkspace).toHaveBeenCalledWith('repo::explicit')
    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({ creator: { kind: 'lease', deviceId: DEVICE_ID } })
    )
  })

  it.each([
    ['current', { worktree: 'current' }],
    ['new-child', { worktree: 'new-child', name: 'child' }],
    ['new-top-level', { worktree: 'new-top-level', name: 'top' }],
    ['omitted', {}]
  ] as const)('rejects a lease worker-start with worktree=%s', async (_label, overrides) => {
    const { run, task } = createLeaseRunAndTask()
    const params = method().params!.parse({
      task: task.id,
      run: run.id,
      agent: 'codex',
      ...overrides
    })

    await expect(method().handler(params, leaseCtx())).rejects.toThrow(
      'A GUI lease caller must name an explicit existing worktree/repo'
    )
    expect(runtime.showTerminal).not.toHaveBeenCalled()
  })

  it('fences a lease worker-start against a run owned by a different device', async () => {
    const { run, task } = createLeaseRunAndTask(OTHER_DEVICE_ID)
    const params = method().params!.parse({
      task: task.id,
      run: run.id,
      worktree: 'repo::explicit',
      agent: 'codex'
    })

    await expect(method().handler(params, leaseCtx())).rejects.toThrow('is not the lease owner')
  })

  it('rejects a lease worker-start with no --run', async () => {
    const { task } = createLeaseRunAndTask()
    const params = method().params!.parse({
      task: task.id,
      worktree: 'repo::explicit',
      agent: 'codex'
    })

    await expect(method().handler(params, leaseCtx())).rejects.toThrow(
      'A GUI lease caller must provide --run'
    )
  })

  it('resolves an explicit --repo/--worktree selector through showManagedTerminalWorkspace', async () => {
    const { run, task } = createLeaseRunAndTask()
    const params = method().params!.parse({
      task: task.id,
      run: run.id,
      worktree: 'id:repo::explicit',
      agent: 'codex'
    })

    await method().handler(params, leaseCtx())

    expect(runtime.showManagedTerminalWorkspace).toHaveBeenCalledWith('id:repo::explicit')
    expect(runtime.showTerminal).not.toHaveBeenCalled()
  })
})
