import type { RunRow } from '../../types'
import { generateId } from '../generated-id'
import type { OrchestrationDb } from '../orchestration-db'

// ── Runs ──

export function createRun(
  this: OrchestrationDb,
  params: {
    objective: string
    coordinatorHandle: string
    coordinatorPaneKey: string
  }
): RunRow {
  const id = generateId('run')
  this.db.exec('BEGIN IMMEDIATE')
  try {
    this.unbindOtherRunsForPane(params.coordinatorPaneKey)
    this.db
      .prepare(
        `INSERT INTO runs (
           id, objective, coordinator_handle, coordinator_pane_key,
           consumer_generation, legacy
         ) VALUES (?, ?, ?, ?, 1, 0)`
      )
      .run(id, params.objective, params.coordinatorHandle, params.coordinatorPaneKey)
    this.rememberRunCoordinatorHandle(id, params.coordinatorHandle)
    this.db.exec('COMMIT')
  } catch (error) {
    this.db.exec('ROLLBACK')
    throw error
  }
  return this.getRun(id) as RunRow
}

// Why: mirrors buildLeasePaneKey/buildLeaseHandle (rpc/methods/orchestration-run-scope.ts);
// duplicated here rather than imported to avoid a db → rpc → orca-runtime → db import cycle.
function leasePaneKey(deviceId: string, runId: string): string {
  return `lease:${deviceId}:${runId}`
}
function leaseHandle(deviceId: string): string {
  return `lease:${deviceId}`
}

/** Mints a Run for a paired GUI device lease: no terminal, no pane, ownership is the device id. */
export function createLeaseRun(
  this: OrchestrationDb,
  params: {
    objective: string
    deviceId: string
  }
): RunRow {
  const id = generateId('run')
  // Why: the pane key embeds this fresh id, so it can never collide with a prior Run —
  // unlike terminal createRun, no unbindOtherRunsForPane call is needed.
  const coordinatorPaneKey = leasePaneKey(params.deviceId, id)
  const coordinatorHandle = leaseHandle(params.deviceId)
  this.db.exec('BEGIN IMMEDIATE')
  try {
    this.db
      .prepare(
        `INSERT INTO runs (
           id, objective, coordinator_handle, coordinator_pane_key,
           consumer_generation, legacy
         ) VALUES (?, ?, ?, ?, 1, 0)`
      )
      .run(id, params.objective, coordinatorHandle, coordinatorPaneKey)
    this.rememberRunCoordinatorHandle(id, coordinatorHandle)
    this.db.exec('COMMIT')
  } catch (error) {
    this.db.exec('ROLLBACK')
    throw error
  }
  return this.getRun(id) as RunRow
}

export type RunCreateMethods = {
  createRun: typeof createRun
  createLeaseRun: typeof createLeaseRun
}

export function attachRunCreate(ctor: { prototype: object }): void {
  Object.assign(ctor.prototype, {
    createRun,
    createLeaseRun
  })
}
