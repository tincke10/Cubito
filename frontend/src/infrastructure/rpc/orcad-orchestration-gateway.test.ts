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
