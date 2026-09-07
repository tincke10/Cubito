import { afterEach, describe, expect, it } from 'vitest'
import type { RpcContext } from '../core'
import {
  GUI_RUN_LEASE_GATES_RUNTIME_CAPABILITY,
  RUNTIME_CAPABILITIES
} from '../../../../shared/protocol-version'
import { createRootDispatch } from '../../orchestration/db/root-dispatch-test-fixture'
import { createOrchestrationRpcHarness } from './orchestration-rpc-test-harness'

const DEVICE_ID = 'device_1'
const OTHER_DEVICE_ID = 'device_2'

// Why: mirrors orchestration-gates-lease-scope.test.ts's coverage for the new
// lease-scoped inbox read — questionList exists only for the paired GUI lease flow.
describe('orchestration.questionList: lease ownership scoping', () => {
  const h = createOrchestrationRpcHarness()

  afterEach(() => h.cleanup())

  it('lets the lease owner read questions on its own Run', async () => {
    const { db, runtime } = h.setup(false)
    const run = db.createLeaseRun({ objective: 'lease questions', deviceId: DEVICE_ID })
    const task = db.createTask({ spec: 'lease question fixture', runId: run.id })
    const dispatch = createRootDispatch(db, task.id, 'lease:device_1')
    db.createQuestion({
      runId: run.id,
      dispatchId: dispatch.id,
      askerHandle: 'lease:device_1',
      question: 'Proceed?'
    })
    const ctx: RpcContext = { runtime, pairedDeviceId: DEVICE_ID, clientKind: 'runtime' }

    const listed = (await h.call('orchestration.questionList', { run: run.id }, ctx)) as {
      questions: unknown[]
      count: number
    }

    expect(listed.count).toBe(1)
    expect(listed.questions).toHaveLength(1)
  })

  it('requires --run for a lease questionList caller', async () => {
    const { runtime } = h.setup(false)
    const ctx: RpcContext = { runtime, pairedDeviceId: DEVICE_ID, clientKind: 'runtime' }

    await expect(h.call('orchestration.questionList', {}, ctx)).rejects.toMatchObject({
      code: 'run_required'
    })
  })

  it('fences a lease questionList against a Run owned by another device', async () => {
    const { db, runtime } = h.setup(false)
    const run = db.createLeaseRun({ objective: 'owned by device_1', deviceId: DEVICE_ID })
    const ctx: RpcContext = { runtime, pairedDeviceId: OTHER_DEVICE_ID, clientKind: 'runtime' }

    await expect(h.call('orchestration.questionList', { run: run.id }, ctx)).rejects.toMatchObject({
      code: 'consumer_fenced'
    })
  })

  it('rejects a non-lease caller (no paired device, no coordinator terminal precedent)', async () => {
    const { db, runtime } = h.setup(false)
    const run = db.createLeaseRun({ objective: 'terminal probe', deviceId: DEVICE_ID })
    const ctx: RpcContext = { runtime }

    await expect(h.call('orchestration.questionList', { run: run.id }, ctx)).rejects.toMatchObject({
      code: 'run_required'
    })
  })

  it('advertises orchestration.gui-run-lease.gates.v1 unconditionally', () => {
    expect(RUNTIME_CAPABILITIES).toContain(GUI_RUN_LEASE_GATES_RUNTIME_CAPABILITY)
  })
})
