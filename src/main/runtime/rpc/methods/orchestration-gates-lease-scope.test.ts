import { afterEach, describe, expect, it } from 'vitest'
import type { RpcContext } from '../core'
import { createOrchestrationRpcHarness } from './orchestration-rpc-test-harness'

const DEVICE_ID = 'device_1'
const OTHER_DEVICE_ID = 'device_2'

// Why: mirrors orchestration-worker-release-lease.test.ts's workerList lease-ownership
// coverage — gateList gets the same isLeaseCaller branch, closing a pre-existing hole
// where an explicit --run with no `from` skipped ownership entirely.
describe('orchestration.gateList: lease ownership scoping', () => {
  const h = createOrchestrationRpcHarness()

  afterEach(() => h.cleanup())

  it('lets the lease owner list gates for its own Run', async () => {
    const { db, runtime } = h.setup(false)
    const run = db.createLeaseRun({ objective: 'lease gates', deviceId: DEVICE_ID })
    const task = db.createTask({ spec: 'lease gate fixture', runId: run.id })
    db.createGate({ taskId: task.id, question: 'Proceed?' })
    const ctx: RpcContext = { runtime, pairedDeviceId: DEVICE_ID, clientKind: 'runtime' }

    const listed = (await h.call('orchestration.gateList', { run: run.id }, ctx)) as {
      gates: unknown[]
      count: number
    }

    expect(listed.count).toBe(1)
    expect(listed.gates).toHaveLength(1)
  })

  it('requires --run for a lease gateList caller', async () => {
    const { runtime } = h.setup(false)
    const ctx: RpcContext = { runtime, pairedDeviceId: DEVICE_ID, clientKind: 'runtime' }

    await expect(h.call('orchestration.gateList', {}, ctx)).rejects.toMatchObject({
      code: 'run_required'
    })
  })

  it('fences a lease gateList against a Run owned by another device', async () => {
    const { db, runtime } = h.setup(false)
    const run = db.createLeaseRun({ objective: 'owned by device_1', deviceId: DEVICE_ID })
    const ctx: RpcContext = { runtime, pairedDeviceId: OTHER_DEVICE_ID, clientKind: 'runtime' }

    await expect(h.call('orchestration.gateList', { run: run.id }, ctx)).rejects.toMatchObject({
      code: 'consumer_fenced'
    })
  })

  it('keeps terminal gateList unscoped (no `from`, no paired device)', async () => {
    const { db, activeRunId, ctx } = h.setup(true)
    const task = db.createTask({ spec: 'terminal gate fixture' })
    db.createGate({ taskId: task.id, question: 'Proceed?' })

    const listed = (await h.call('orchestration.gateList', { run: activeRunId }, ctx)) as {
      gates: unknown[]
      count: number
    }

    expect(listed.count).toBe(1)
  })
})

// Why: mirrors gateList's isLeaseCaller branch — a paired GUI device with no
// callerTerminalHandle resolving a gate must go through assertLeaseOwnership too.
describe('orchestration.gateResolve: lease ownership scoping', () => {
  const h = createOrchestrationRpcHarness()

  afterEach(() => h.cleanup())

  it('lets the lease owner resolve a gate on its own Run', async () => {
    const { db, runtime } = h.setup(false)
    const run = db.createLeaseRun({ objective: 'lease gate resolve', deviceId: DEVICE_ID })
    const task = db.createTask({ spec: 'lease gate fixture', runId: run.id })
    const gate = db.createGate({ taskId: task.id, question: 'Proceed?' })
    const ctx: RpcContext = { runtime, pairedDeviceId: DEVICE_ID, clientKind: 'runtime' }

    const resolved = (await h.call(
      'orchestration.gateResolve',
      { id: gate.id, resolution: 'yes', run: run.id },
      ctx
    )) as { gate: { status: string; resolution: string } }

    expect(resolved.gate.status).toBe('resolved')
    expect(resolved.gate.resolution).toBe('yes')
  })

  it('requires --run for a lease gateResolve caller', async () => {
    const { db, runtime } = h.setup(false)
    const run = db.createLeaseRun({ objective: 'no run given', deviceId: DEVICE_ID })
    const task = db.createTask({ spec: 'lease gate fixture', runId: run.id })
    const gate = db.createGate({ taskId: task.id, question: 'Proceed?' })
    const ctx: RpcContext = { runtime, pairedDeviceId: DEVICE_ID, clientKind: 'runtime' }

    await expect(
      h.call('orchestration.gateResolve', { id: gate.id, resolution: 'yes' }, ctx)
    ).rejects.toMatchObject({ code: 'run_required' })
  })

  it('fences a lease gateResolve against a Run owned by another device', async () => {
    const { db, runtime } = h.setup(false)
    const run = db.createLeaseRun({ objective: 'owned by device_1', deviceId: DEVICE_ID })
    const task = db.createTask({ spec: 'lease gate fixture', runId: run.id })
    const gate = db.createGate({ taskId: task.id, question: 'Proceed?' })
    const ctx: RpcContext = { runtime, pairedDeviceId: OTHER_DEVICE_ID, clientKind: 'runtime' }

    await expect(
      h.call('orchestration.gateResolve', { id: gate.id, resolution: 'yes', run: run.id }, ctx)
    ).rejects.toMatchObject({ code: 'consumer_fenced' })
  })

  it('keeps terminal gateResolve unscoped (no paired device)', async () => {
    const { db, activeRunId, ctx } = h.setup(true)
    const task = db.createTask({ spec: 'terminal gate fixture' })
    const gate = db.createGate({ taskId: task.id, question: 'Proceed?' })

    const resolved = (await h.call(
      'orchestration.gateResolve',
      { id: gate.id, resolution: 'yes', run: activeRunId },
      ctx
    )) as { gate: { status: string } }

    expect(resolved.gate.status).toBe('resolved')
  })
})
