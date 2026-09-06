// Pure lease-key formatters shared by the db layer (run-create) and the rpc layer
// (orchestration-run-scope). A leaf module with no imports, so both can use it without the
// db → rpc → orca-runtime → db cycle that blocked a direct import.

/** Synthetic per-Run pane key for a paired-device lease. Two colons, so `parsePaneKey` rejects it. */
export function buildLeasePaneKey(deviceId: string, runId: string): string {
  return `lease:${deviceId}:${runId}`
}

/** Synthetic coordinator handle for a paired-device lease. */
export function buildLeaseHandle(deviceId: string): string {
  return `lease:${deviceId}`
}
