import { describe, expect, it, vi } from 'vitest'
import { createOrchestrationLeaseMethods } from './orcad-orchestration-gateway'
import type { RpcCaller } from './orcad-gateway'

const frame = (result: unknown) => ({
  id: 'x',
  ok: true as const,
  result,
  _meta: { runtimeId: 'rt' }
})

describe('createOrchestrationLeaseMethods — orchestrationRunCreate', () => {
  it('calls orchestration.runCreate with only {objective} — no `from` (lease caller)', async () => {
    const call: RpcCaller = vi.fn(async () => frame({ run: { id: 'run-1' } }))
    const methods = createOrchestrationLeaseMethods({ call })
    await expect(
      methods.orchestrationRunCreate({ objective: 'Camada de 3 cubos' })
    ).resolves.toEqual({ runId: 'run-1' })
    expect(call).toHaveBeenCalledWith('orchestration.runCreate', { objective: 'Camada de 3 cubos' })
  })

  it('throws when the result carries no run id', async () => {
    const call: RpcCaller = vi.fn(async () => frame({ run: {} }))
    const methods = createOrchestrationLeaseMethods({ call })
    await expect(methods.orchestrationRunCreate({ objective: 'x' })).rejects.toThrow(
      /orchestration\.runCreate/
    )
  })
})

describe('createOrchestrationLeaseMethods — orchestrationTaskCreate', () => {
  it('calls orchestration.taskCreate with {spec, run} — no callerTerminalHandle', async () => {
    const call: RpcCaller = vi.fn(async () => frame({ task: { id: 'task-1' } }))
    const methods = createOrchestrationLeaseMethods({ call })
    await expect(
      methods.orchestrationTaskCreate({ spec: 'do the thing', run: 'run-1' })
    ).resolves.toEqual({ taskId: 'task-1' })
    expect(call).toHaveBeenCalledWith('orchestration.taskCreate', {
      spec: 'do the thing',
      run: 'run-1'
    })
  })

  it('passes taskTitle/displayName through and JSON.stringifies deps', async () => {
    const call: RpcCaller = vi.fn(async () => frame({ task: { id: 'task-2' } }))
    const methods = createOrchestrationLeaseMethods({ call })
    await methods.orchestrationTaskCreate({
      spec: 'spec',
      run: 'run-1',
      taskTitle: 'title',
      displayName: 'camada-abc123',
      deps: ['task-a', 'task-b']
    })
    expect(call).toHaveBeenCalledWith('orchestration.taskCreate', {
      spec: 'spec',
      run: 'run-1',
      taskTitle: 'title',
      displayName: 'camada-abc123',
      deps: JSON.stringify(['task-a', 'task-b'])
    })
  })

  it('throws when the result carries no task id', async () => {
    const call: RpcCaller = vi.fn(async () => frame({ task: {} }))
    const methods = createOrchestrationLeaseMethods({ call })
    await expect(methods.orchestrationTaskCreate({ spec: 'x', run: 'run-1' })).rejects.toThrow(
      /orchestration\.taskCreate/
    )
  })
})

describe('createOrchestrationLeaseMethods — orchestrationWorkerStart', () => {
  const workerStartResult = {
    dispatchId: 'dispatch-1',
    runId: 'run-1',
    taskId: 'task-1',
    state: 'ready',
    stage: 'agent_readiness'
  }

  it('calls orchestration.workerStart with {task, run, worktree} — no `from`, worktree required', async () => {
    const call: RpcCaller = vi.fn(async () => frame(workerStartResult))
    const methods = createOrchestrationLeaseMethods({ call })
    await expect(
      methods.orchestrationWorkerStart({ task: 'task-1', run: 'run-1', worktree: 'w1' })
    ).resolves.toEqual(workerStartResult)
    expect(call).toHaveBeenCalledWith('orchestration.workerStart', {
      task: 'task-1',
      run: 'run-1',
      worktree: 'w1'
    })
  })

  it('passes agent/name/displayName through when given', async () => {
    const call: RpcCaller = vi.fn(async () => frame(workerStartResult))
    const methods = createOrchestrationLeaseMethods({ call })
    await methods.orchestrationWorkerStart({
      task: 'task-1',
      run: 'run-1',
      worktree: 'w1',
      agent: 'claude',
      name: 'camada-abc123',
      displayName: 'camada-abc123'
    })
    expect(call).toHaveBeenCalledWith('orchestration.workerStart', {
      task: 'task-1',
      run: 'run-1',
      worktree: 'w1',
      agent: 'claude',
      name: 'camada-abc123',
      displayName: 'camada-abc123'
    })
  })

  it('throws when the result is missing a required field', async () => {
    const call: RpcCaller = vi.fn(async () =>
      frame({ ...workerStartResult, dispatchId: undefined })
    )
    const methods = createOrchestrationLeaseMethods({ call })
    await expect(
      methods.orchestrationWorkerStart({ task: 'task-1', run: 'run-1', worktree: 'w1' })
    ).rejects.toThrow(/orchestration\.workerStart/)
  })
})

describe('createOrchestrationLeaseMethods — orchestrationWorkerList', () => {
  it('calls orchestration.workerList with {run} — no `from` (lease caller)', async () => {
    const call: RpcCaller = vi.fn(async () => frame({ workers: [] }))
    const methods = createOrchestrationLeaseMethods({ call })
    await methods.orchestrationWorkerList({ run: 'run-1' })
    expect(call).toHaveBeenCalledWith('orchestration.workerList', { run: 'run-1' })
  })

  it('passes terminalState through when given', async () => {
    const call: RpcCaller = vi.fn(async () => frame({ workers: [] }))
    const methods = createOrchestrationLeaseMethods({ call })
    await methods.orchestrationWorkerList({ run: 'run-1', terminalState: 'active' })
    expect(call).toHaveBeenCalledWith('orchestration.workerList', {
      run: 'run-1',
      terminalState: 'active'
    })
  })

  it('projects dispatchId/workerState/dispatchStatus and resource.worktreeId -> worktreeId', async () => {
    const call: RpcCaller = vi.fn(async () =>
      frame({
        workers: [
          {
            dispatchId: 'dispatch-1',
            workerState: 'ready',
            dispatchStatus: 'dispatched',
            resource: { worktreeId: 'repo::/child' }
          }
        ]
      })
    )
    const methods = createOrchestrationLeaseMethods({ call })
    await expect(methods.orchestrationWorkerList({ run: 'run-1' })).resolves.toEqual({
      workers: [
        {
          dispatchId: 'dispatch-1',
          workerState: 'ready',
          dispatchStatus: 'dispatched',
          worktreeId: 'repo::/child'
        }
      ]
    })
  })

  it('projects a null resource (or missing worktreeId) to worktreeId: null', async () => {
    const call: RpcCaller = vi.fn(async () =>
      frame({
        workers: [
          {
            dispatchId: 'dispatch-1',
            workerState: 'ready',
            dispatchStatus: 'dispatched',
            resource: null
          },
          {
            dispatchId: 'dispatch-2',
            workerState: 'ready',
            dispatchStatus: 'dispatched',
            resource: {}
          }
        ]
      })
    )
    const methods = createOrchestrationLeaseMethods({ call })
    const result = await methods.orchestrationWorkerList({ run: 'run-1' })
    expect(result.workers.map((w) => w.worktreeId)).toEqual([null, null])
  })

  it('throws when the result carries no workers array', async () => {
    const call: RpcCaller = vi.fn(async () => frame({}))
    const methods = createOrchestrationLeaseMethods({ call })
    await expect(methods.orchestrationWorkerList({ run: 'run-1' })).rejects.toThrow(
      /orchestration\.workerList/
    )
  })
})

describe('createOrchestrationLeaseMethods — orchestrationWorkerShow (MINIMAL+)', () => {
  it('calls orchestration.workerShow with only {dispatch} — no `from`, no `run`', async () => {
    const call: RpcCaller = vi.fn(async () => frame({ observation: {} }))
    const methods = createOrchestrationLeaseMethods({ call })
    await methods.orchestrationWorkerShow({ dispatch: 'dispatch-1' })
    expect(call).toHaveBeenCalledWith('orchestration.workerShow', { dispatch: 'dispatch-1' })
  })

  it('projects a present agentWait object to awaitingInput: true', async () => {
    const call: RpcCaller = vi.fn(async () =>
      frame({ observation: { agentWait: { source: 'hook', reason: 'permission' } } })
    )
    const methods = createOrchestrationLeaseMethods({ call })
    await expect(methods.orchestrationWorkerShow({ dispatch: 'dispatch-1' })).resolves.toEqual({
      awaitingInput: true
    })
  })

  it('projects agentWait: null (looked, not waiting) to awaitingInput: false', async () => {
    const call: RpcCaller = vi.fn(async () => frame({ observation: { agentWait: null } }))
    const methods = createOrchestrationLeaseMethods({ call })
    await expect(methods.orchestrationWorkerShow({ dispatch: 'dispatch-1' })).resolves.toEqual({
      awaitingInput: false
    })
  })

  it('projects an absent agentWait key (never looked) to awaitingInput: null', async () => {
    const call: RpcCaller = vi.fn(async () => frame({ observation: {} }))
    const methods = createOrchestrationLeaseMethods({ call })
    await expect(methods.orchestrationWorkerShow({ dispatch: 'dispatch-1' })).resolves.toEqual({
      awaitingInput: null
    })
  })

  it('projects a missing observation to awaitingInput: null', async () => {
    const call: RpcCaller = vi.fn(async () => frame({}))
    const methods = createOrchestrationLeaseMethods({ call })
    await expect(methods.orchestrationWorkerShow({ dispatch: 'dispatch-1' })).resolves.toEqual({
      awaitingInput: null
    })
  })
})
