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

describe('createOrchestrationLeaseMethods — orchestrationGateList (Change C-EXTENDED)', () => {
  it('calls orchestration.gateList with only {run} — no `from` (lease caller)', async () => {
    const call: RpcCaller = vi.fn(async () => frame({ gates: [] }))
    const methods = createOrchestrationLeaseMethods({ call })
    await methods.orchestrationGateList({ run: 'run-1' })
    expect(call).toHaveBeenCalledWith('orchestration.gateList', { run: 'run-1' })
  })

  it('projects a raw DecisionGateRow (snake_case wire shape) to camelCase LeaseGateRow', async () => {
    const call: RpcCaller = vi.fn(async () =>
      frame({
        gates: [
          {
            id: 'gate-1',
            run_id: 'run-1',
            task_id: 'task-1',
            question: 'Which approach?',
            options: '["a","b"]',
            status: 'pending',
            resolution: null,
            created_at: '2026-01-01T00:00:00Z',
            resolved_at: null
          }
        ]
      })
    )
    const methods = createOrchestrationLeaseMethods({ call })
    await expect(methods.orchestrationGateList({ run: 'run-1' })).resolves.toEqual({
      gates: [
        {
          id: 'gate-1',
          runId: 'run-1',
          taskId: 'task-1',
          question: 'Which approach?',
          options: '["a","b"]',
          status: 'pending',
          resolution: null,
          createdAt: '2026-01-01T00:00:00Z',
          resolvedAt: null
        }
      ]
    })
  })

  it('throws when the result carries no gates array', async () => {
    const call: RpcCaller = vi.fn(async () => frame({}))
    const methods = createOrchestrationLeaseMethods({ call })
    await expect(methods.orchestrationGateList({ run: 'run-1' })).rejects.toThrow(
      /orchestration\.gateList/
    )
  })
})

describe('createOrchestrationLeaseMethods — orchestrationGateResolve (Change F)', () => {
  it('calls orchestration.gateResolve with {run, id, resolution} — no `from` (lease caller)', async () => {
    const call: RpcCaller = vi.fn(async () =>
      frame({
        gate: {
          id: 'gate-1',
          run_id: 'run-1',
          task_id: 'task-1',
          question: 'Which approach?',
          options: '["a","b"]',
          status: 'resolved',
          resolution: 'a',
          created_at: '2026-01-01T00:00:00Z',
          resolved_at: '2026-01-01T00:05:00Z'
        }
      })
    )
    const methods = createOrchestrationLeaseMethods({ call })
    await expect(
      methods.orchestrationGateResolve({ run: 'run-1', gateId: 'gate-1', resolution: 'a' })
    ).resolves.toEqual({
      gate: {
        id: 'gate-1',
        runId: 'run-1',
        taskId: 'task-1',
        question: 'Which approach?',
        options: '["a","b"]',
        status: 'resolved',
        resolution: 'a',
        createdAt: '2026-01-01T00:00:00Z',
        resolvedAt: '2026-01-01T00:05:00Z'
      }
    })
    expect(call).toHaveBeenCalledWith('orchestration.gateResolve', {
      run: 'run-1',
      id: 'gate-1',
      resolution: 'a'
    })
  })

  it('throws when the result carries no gate', async () => {
    const call: RpcCaller = vi.fn(async () => frame({}))
    const methods = createOrchestrationLeaseMethods({ call })
    await expect(
      methods.orchestrationGateResolve({ run: 'run-1', gateId: 'gate-1', resolution: 'a' })
    ).rejects.toThrow(/orchestration\.gateResolve/)
  })
})

describe('createOrchestrationLeaseMethods — orchestrationQuestionList (Change C-EXTENDED)', () => {
  it('calls orchestration.questionList with only {run} — no `from` (lease caller)', async () => {
    const call: RpcCaller = vi.fn(async () => frame({ questions: [] }))
    const methods = createOrchestrationLeaseMethods({ call })
    await methods.orchestrationQuestionList({ run: 'run-1' })
    expect(call).toHaveBeenCalledWith('orchestration.questionList', { run: 'run-1' })
  })

  it('projects a raw QuestionRow (snake_case wire shape) to camelCase LeaseQuestionRow', async () => {
    const call: RpcCaller = vi.fn(async () =>
      frame({
        questions: [
          {
            message_id: 'msg-1',
            run_id: 'run-1',
            dispatch_id: 'dispatch-1',
            asker_handle: 'worker-1',
            status: 'answered',
            answer_message_id: 'msg-2',
            answer_body: 'go with a',
            answered_by_generation: 2,
            created_at: '2026-01-01T00:00:00Z',
            answered_at: '2026-01-01T00:05:00Z',
            closed_at: null
          }
        ]
      })
    )
    const methods = createOrchestrationLeaseMethods({ call })
    await expect(methods.orchestrationQuestionList({ run: 'run-1' })).resolves.toEqual({
      questions: [
        {
          messageId: 'msg-1',
          runId: 'run-1',
          dispatchId: 'dispatch-1',
          askerHandle: 'worker-1',
          status: 'answered',
          answerMessageId: 'msg-2',
          answerBody: 'go with a',
          answeredByGeneration: 2,
          createdAt: '2026-01-01T00:00:00Z',
          answeredAt: '2026-01-01T00:05:00Z',
          closedAt: null
        }
      ]
    })
  })

  it('projects an optional `question` field (wave E4) when the host includes it', async () => {
    const call: RpcCaller = vi.fn(async () =>
      frame({
        questions: [
          {
            message_id: 'msg-1',
            run_id: 'run-1',
            dispatch_id: 'dispatch-1',
            asker_handle: 'worker-1',
            status: 'pending',
            answer_message_id: null,
            answer_body: null,
            answered_by_generation: null,
            created_at: '2026-01-01T00:00:00Z',
            answered_at: null,
            closed_at: null,
            question: 'Which branch should we merge?'
          }
        ]
      })
    )
    const methods = createOrchestrationLeaseMethods({ call })
    const result = await methods.orchestrationQuestionList({ run: 'run-1' })
    expect(result.questions[0]?.question).toBe('Which branch should we merge?')
  })

  it('omits `question` (never adds an undefined key) when the host does not include it', async () => {
    const call: RpcCaller = vi.fn(async () =>
      frame({
        questions: [
          {
            message_id: 'msg-1',
            run_id: 'run-1',
            dispatch_id: 'dispatch-1',
            asker_handle: 'worker-1',
            status: 'pending',
            answer_message_id: null,
            answer_body: null,
            answered_by_generation: null,
            created_at: '2026-01-01T00:00:00Z',
            answered_at: null,
            closed_at: null
          }
        ]
      })
    )
    const methods = createOrchestrationLeaseMethods({ call })
    const result = await methods.orchestrationQuestionList({ run: 'run-1' })
    expect('question' in (result.questions[0] as object)).toBe(false)
  })

  it('throws when the result carries no questions array', async () => {
    const call: RpcCaller = vi.fn(async () => frame({}))
    const methods = createOrchestrationLeaseMethods({ call })
    await expect(methods.orchestrationQuestionList({ run: 'run-1' })).rejects.toThrow(
      /orchestration\.questionList/
    )
  })
})

describe('createOrchestrationLeaseMethods — orchestrationQuestionAnswer (Change F)', () => {
  it('calls orchestration.reply with {run, id, body} — no `from` (lease caller)', async () => {
    const call: RpcCaller = vi.fn(async () =>
      frame({ message: { id: 'msg-2' }, question: {}, duplicate: false })
    )
    const methods = createOrchestrationLeaseMethods({ call })
    await expect(
      methods.orchestrationQuestionAnswer({ run: 'run-1', messageId: 'msg-1', body: 'go with a' })
    ).resolves.toEqual({ messageId: 'msg-2', duplicate: false })
    expect(call).toHaveBeenCalledWith('orchestration.reply', {
      run: 'run-1',
      id: 'msg-1',
      body: 'go with a'
    })
  })

  it('projects duplicate:true on an idempotent re-answer', async () => {
    const call: RpcCaller = vi.fn(async () =>
      frame({ message: { id: 'msg-2' }, question: {}, duplicate: true })
    )
    const methods = createOrchestrationLeaseMethods({ call })
    await expect(
      methods.orchestrationQuestionAnswer({ run: 'run-1', messageId: 'msg-1', body: 'go with a' })
    ).resolves.toEqual({ messageId: 'msg-2', duplicate: true })
  })

  it('throws when the result carries no message id', async () => {
    const call: RpcCaller = vi.fn(async () => frame({}))
    const methods = createOrchestrationLeaseMethods({ call })
    await expect(
      methods.orchestrationQuestionAnswer({ run: 'run-1', messageId: 'msg-1', body: 'go with a' })
    ).rejects.toThrow(/orchestration\.reply/)
  })
})
