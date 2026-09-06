import { afterEach, describe, expect, it } from 'vitest'
import { OrchestrationDb } from '../orchestration-db'

/**
 * Wave 3 (fan-out v2 Change A): createLeaseRun mints a Run row for a paired
 * GUI device with no terminal pane — synthetic pane/handle embed the runId so
 * two lease Runs from the same device can never collide.
 */
describe('createLeaseRun', () => {
  let db: OrchestrationDb

  afterEach(() => {
    db.close()
  })

  it('mints a Run with a synthetic per-run pane key and per-device handle', () => {
    db = new OrchestrationDb(':memory:')
    const run = db.createLeaseRun({ objective: 'lease obj', deviceId: 'device_1' })

    expect(run.coordinator_pane_key).toBe(`lease:device_1:${run.id}`)
    expect(run.coordinator_handle).toBe('lease:device_1')
    expect(run.legacy).toBe(0)
    expect(run.consumer_generation).toBe(1)
  })

  it('isolates two lease Runs minted by the same device', () => {
    db = new OrchestrationDb(':memory:')
    const first = db.createLeaseRun({ objective: 'first', deviceId: 'device_1' })
    const second = db.createLeaseRun({ objective: 'second', deviceId: 'device_1' })

    expect(first.id).not.toBe(second.id)
    expect(first.coordinator_pane_key).not.toBe(second.coordinator_pane_key)
    expect(db.getRun(first.id)?.coordinator_pane_key).toBe(first.coordinator_pane_key)
    expect(db.getRun(second.id)?.coordinator_pane_key).toBe(second.coordinator_pane_key)
  })

  it('leaves terminal createRun untouched', () => {
    db = new OrchestrationDb(':memory:')
    const run = db.createRun({
      objective: 'terminal obj',
      coordinatorHandle: 'term_coord',
      coordinatorPaneKey: 'tab_coord:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    })

    expect(run.coordinator_handle).toBe('term_coord')
    expect(run.coordinator_pane_key).toBe('tab_coord:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
    expect(run.legacy).toBe(0)
  })
})
