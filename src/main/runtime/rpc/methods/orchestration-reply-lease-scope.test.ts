import { afterEach, describe, expect, it } from 'vitest'
import type { RpcContext } from '../core'
import { createRootDispatch } from '../../orchestration/db/root-dispatch-test-fixture'
import { createOrchestrationRpcHarness } from './orchestration-rpc-test-harness'

const DEVICE_ID = 'device_1'
const OTHER_DEVICE_ID = 'device_2'

// Why: mirrors orchestration-gates-lease-scope.test.ts — the reply question-branch
// gets the same isLeaseCaller predicate as gateResolve/gateList/taskCreate.
describe('orchestration.reply: lease ownership scoping (question branch)', () => {
  const h = createOrchestrationRpcHarness()

  afterEach(() => h.cleanup())

  function createLeaseQuestion(deviceId: string) {
    const { db, runtime } = h.setup(false)
    const run = db.createLeaseRun({ objective: 'lease reply', deviceId })
    const task = db.createTask({ spec: 'lease question fixture', runId: run.id })
    const dispatch = createRootDispatch(db, task.id, `lease:${deviceId}`)
    const created = db.createQuestion({
      runId: run.id,
      dispatchId: dispatch.id,
      askerHandle: `lease:${deviceId}`,
      question: 'Proceed?'
    })
    return { db, runtime, run, question: created.question }
  }

  it('lets the lease owner answer a question on its own Run', async () => {
    const { runtime, run, question } = createLeaseQuestion(DEVICE_ID)
    const ctx: RpcContext = { runtime, pairedDeviceId: DEVICE_ID, clientKind: 'runtime' }

    const result = (await h.call(
      'orchestration.reply',
      { id: question.message_id, body: 'go ahead', run: run.id },
      ctx
    )) as { question: { status: string }; duplicate: boolean }

    expect(result.question.status).toBe('answered')
    expect(result.duplicate).toBe(false)
  })

  it('fences a lease reply against a question owned by another device', async () => {
    const { runtime, run, question } = createLeaseQuestion(DEVICE_ID)
    const ctx: RpcContext = { runtime, pairedDeviceId: OTHER_DEVICE_ID, clientKind: 'runtime' }

    await expect(
      h.call('orchestration.reply', { id: question.message_id, body: 'go ahead', run: run.id }, ctx)
    ).rejects.toMatchObject({ code: 'consumer_fenced' })
  })

  it('keeps answerQuestion idempotency: identical body replays as duplicate', async () => {
    const { runtime, run, question } = createLeaseQuestion(DEVICE_ID)
    const ctx: RpcContext = { runtime, pairedDeviceId: DEVICE_ID, clientKind: 'runtime' }
    const params = { id: question.message_id, body: 'go ahead', run: run.id }

    await h.call('orchestration.reply', params, ctx)
    const replay = (await h.call('orchestration.reply', params, ctx)) as { duplicate: boolean }

    expect(replay.duplicate).toBe(true)
  })

  it('rejects a conflicting answer to an already-answered question', async () => {
    const { runtime, run, question } = createLeaseQuestion(DEVICE_ID)
    const ctx: RpcContext = { runtime, pairedDeviceId: DEVICE_ID, clientKind: 'runtime' }
    await h.call(
      'orchestration.reply',
      { id: question.message_id, body: 'go ahead', run: run.id },
      ctx
    )

    await expect(
      h.call('orchestration.reply', { id: question.message_id, body: 'no', run: run.id }, ctx)
    ).rejects.toMatchObject({ code: 'answer_conflict' })
  })
})
