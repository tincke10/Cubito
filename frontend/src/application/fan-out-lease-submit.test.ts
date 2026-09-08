import { describe, expect, it, vi } from 'vitest'
import { runCamadaLeaseSubmit } from './fan-out-lease-submit'
import type { FanOutAction, FanOutSlice } from './fan-out-model'
import type {
  CreateWorktreeInput,
  CreateWorktreeResult,
  LeaseRunCreateInput,
  LeaseRunCreateResult,
  LeaseTaskCreateInput,
  LeaseTaskCreateResult,
  LeaseWorkerStartInput,
  LeaseWorkerStartResult
} from './ports/runtime-gateway'

const formSlice = (
  overrides: Partial<Extract<FanOutSlice, { view: 'form' }>> = {}
): FanOutSlice => ({
  view: 'form',
  parentId: 'w1',
  fields: { count: 2, agent: 'claude', prompt: 'fix the bug' },
  repoSelector: 'id:repo-a',
  ...overrides
})

const workerStartResult: LeaseWorkerStartResult = {
  dispatchId: 'dispatch-1',
  runId: 'run-1',
  taskId: 'task-1',
  state: 'ready',
  stage: 'agent_readiness'
}

const createFakeGateway = () => ({
  createWorktree: vi.fn<(input: CreateWorktreeInput) => Promise<CreateWorktreeResult>>(
    async (input) => ({ worktreeId: `wt-${input.clientMutationId}` })
  ),
  orchestrationRunCreate: vi.fn<(input: LeaseRunCreateInput) => Promise<LeaseRunCreateResult>>(
    async () => ({ runId: 'run-1' })
  ),
  orchestrationTaskCreate: vi.fn<(input: LeaseTaskCreateInput) => Promise<LeaseTaskCreateResult>>(
    async () => ({ taskId: 'task-1' })
  ),
  orchestrationWorkerStart: vi.fn<
    (input: LeaseWorkerStartInput) => Promise<LeaseWorkerStartResult>
  >(async () => workerStartResult)
})

const setup = (gateway: ReturnType<typeof createFakeGateway> = createFakeGateway()) => {
  const dispatch = vi.fn<(action: FanOutAction) => void>()
  return { gateway, dispatch }
}

describe('runCamadaLeaseSubmit — happy path', () => {
  it('creates the run once, then per child: worktree.create (no startupAgent) -> taskCreate -> workerStart', async () => {
    const { gateway, dispatch } = setup()
    const result = await runCamadaLeaseSubmit(
      formSlice({ fields: { count: 2, agent: 'claude', prompt: 'fix the bug' } }),
      'id:repo-a',
      ['m1', 'm2'],
      { gateway, dispatch }
    )

    expect(gateway.orchestrationRunCreate).toHaveBeenCalledOnce()
    expect(gateway.orchestrationRunCreate).toHaveBeenCalledWith({ objective: 'fix the bug' })

    expect(gateway.createWorktree).toHaveBeenNthCalledWith(1, {
      repo: 'id:repo-a',
      parentWorktree: 'w1',
      clientMutationId: 'm1',
      name: 'camada-m1',
      nameWasGenerated: true
    })
    expect(gateway.createWorktree.mock.calls[0]![0]).not.toHaveProperty('startupAgent')
    expect(gateway.createWorktree.mock.calls[0]![0]).not.toHaveProperty('startupPrompt')

    expect(gateway.orchestrationTaskCreate).toHaveBeenNthCalledWith(1, {
      spec: 'fix the bug',
      run: 'run-1',
      displayName: 'camada-m1'
    })
    expect(gateway.orchestrationWorkerStart).toHaveBeenNthCalledWith(1, {
      task: 'task-1',
      run: 'run-1',
      worktree: 'wt-m1',
      displayName: 'camada-m1',
      agent: 'claude'
    })

    expect(result.runCreateFailed).toBe(false)
    expect(result.localSlice).toMatchObject({
      view: 'running',
      runId: 'run-1',
      batch: [
        { mutationId: 'm1', worktreeId: 'wt-m1', dispatchId: 'dispatch-1', taskId: 'task-1' },
        { mutationId: 'm2', worktreeId: 'wt-m2', dispatchId: 'dispatch-1', taskId: 'task-1' }
      ]
    })
  })

  it('dispatches run-created, then child-created before child-dispatched, per child', async () => {
    const { gateway, dispatch } = setup()
    await runCamadaLeaseSubmit(formSlice(), 'id:repo-a', ['m1'], { gateway, dispatch })

    const types = dispatch.mock.calls.map((call) => call[0]!.type)
    expect(types).toEqual(['run-created', 'child-created', 'child-dispatched'])
  })

  it('omits agent from workerStart params when the form agent is none', async () => {
    const { gateway, dispatch } = setup()
    await runCamadaLeaseSubmit(
      formSlice({ fields: { count: 1, agent: 'none', prompt: '' } }),
      'id:repo-a',
      ['m1'],
      { gateway, dispatch }
    )
    expect(gateway.orchestrationWorkerStart.mock.calls[0]![0]).not.toHaveProperty('agent')
  })

  it('trims the prompt into the objective/spec — never a generated placeholder', async () => {
    const { gateway, dispatch } = setup()
    await runCamadaLeaseSubmit(
      formSlice({ fields: { count: 3, agent: 'claude', prompt: '  fix the bug  ' } }),
      'id:repo-a',
      ['m1', 'm2', 'm3'],
      { gateway, dispatch }
    )
    expect(gateway.orchestrationRunCreate).toHaveBeenCalledWith({ objective: 'fix the bug' })
    expect(gateway.orchestrationTaskCreate.mock.calls[0]![0]).toMatchObject({ spec: 'fix the bug' })
  })
})

describe('runCamadaLeaseSubmit — error branches', () => {
  it('worktree.create throw: dispatches child-failed and skips taskCreate/workerStart for that child', async () => {
    const gateway = createFakeGateway()
    gateway.createWorktree.mockRejectedValueOnce(new Error('boom'))
    const { dispatch } = setup(gateway)
    const result = await runCamadaLeaseSubmit(formSlice(), 'id:repo-a', ['m1', 'm2'], {
      gateway,
      dispatch
    })

    expect(gateway.orchestrationTaskCreate).toHaveBeenCalledTimes(1) // only for m2
    expect(dispatch).toHaveBeenCalledWith({
      type: 'child-failed',
      mutationId: 'm1',
      message: 'boom'
    })
    expect(result.localSlice).toMatchObject({
      batch: [
        { mutationId: 'm1', worktreeId: null, failed: true, errorMessage: 'boom' },
        { mutationId: 'm2', worktreeId: 'wt-m2' }
      ]
    })
  })

  it('workerStart throw: dispatches child-failed even though the task and worktree exist', async () => {
    const gateway = createFakeGateway()
    gateway.orchestrationWorkerStart.mockRejectedValueOnce(new Error('boom'))
    const { dispatch } = setup(gateway)
    const result = await runCamadaLeaseSubmit(formSlice(), 'id:repo-a', ['m1'], {
      gateway,
      dispatch
    })

    expect(dispatch).toHaveBeenCalledWith({
      type: 'child-failed',
      mutationId: 'm1',
      message: 'boom'
    })
    expect(result.localSlice).toMatchObject({
      batch: [
        {
          mutationId: 'm1',
          worktreeId: 'wt-m1',
          failed: true,
          dispatchId: null,
          taskId: null,
          errorMessage: 'boom'
        }
      ]
    })
  })

  it('orchestration.runCreate throw: signals runCreateFailed, makes zero worktree.create calls', async () => {
    const gateway = createFakeGateway()
    gateway.orchestrationRunCreate.mockRejectedValueOnce(new Error('boom'))
    const { dispatch } = setup(gateway)
    const result = await runCamadaLeaseSubmit(formSlice(), 'id:repo-a', ['m1', 'm2'], {
      gateway,
      dispatch
    })

    expect(result.runCreateFailed).toBe(true)
    expect(gateway.createWorktree).not.toHaveBeenCalled()
    expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'run-created' }))
    expect(result.localSlice).toMatchObject({
      view: 'running',
      runId: null,
      batch: [
        { mutationId: 'm1', worktreeId: null, failed: false },
        { mutationId: 'm2', worktreeId: null, failed: false }
      ]
    })
  })
})

describe('runCamadaLeaseSubmit — outside form view', () => {
  it('is a no-op when the slice is not form', async () => {
    const { gateway, dispatch } = setup()
    const closed: FanOutSlice = { view: 'closed', repoSelector: null }
    const result = await runCamadaLeaseSubmit(closed, 'id:repo-a', ['m1'], { gateway, dispatch })
    expect(result).toEqual({ localSlice: closed, runCreateFailed: false })
    expect(gateway.orchestrationRunCreate).not.toHaveBeenCalled()
    expect(dispatch).not.toHaveBeenCalled()
  })
})
